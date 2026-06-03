import DockerSandboxManager from './sandbox.js';
import eventBus from '../utils/eventBus.js'; // Imported our global communication bridge
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import {client} from "../grpc_client/index.js";
import {redisClient} from "../server.js"
import { tsClient } from '../server.js';
import fs from "node:fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class SubmissionQueueManager {
  constructor() {
    this.queue = [];
    this.isProcessing = false;
    this.activeJob = null;
  }

  enqueue(job) {
    console.log(`[QUEUE] Enqueuing new submission for Team: ${job.teamId}`);
    this.queue.push({
      ...job,
      status: 'PENDING',
      createdAt: new Date()
    });
    this.processNext();
  }

  async processNext() {
    if (this.isProcessing) {
      console.log(`[QUEUE] Processor busy. ${this.queue.length} jobs waiting.`);
      return;
    }

    if (this.queue.length === 0) {
      this.isProcessing = false;
      this.activeJob = null;
      return;
    }

    this.isProcessing = true;
    this.activeJob = this.queue.shift(); 
    this.activeJob.status = 'PROCESSING';

    const submissionId = this.activeJob.submissionId;
    const teamId = this.activeJob.teamId;

    console.log(`[QUEUE] Starting active execution for Team: ${teamId}`);

    let sandboxResult = null;

    try {
      // Step A: Start the secure container with dynamic port mapping [2]
      sandboxResult = await DockerSandboxManager.runContainer(teamId, submissionId, this.activeJob.binaryPath);

      // Publish initial SSE log event [2]
      eventBus.emit(`stream:${submissionId}`, {
        progress: 10,
        log: `[SYSTEM] Sandbox active at: http://localhost:${sandboxResult.mappedPort} [OK]`,
        completed: false
      });

      // Step B: Trigger Bot Fleet and pipe live performance updates to Event Bus
      await this.triggerBotFleetAndStream(sandboxResult.mappedPort, submissionId);

    } catch (error) {
      console.error(`[QUEUE ERROR] Benchmark failed:`, error.message);
      eventBus.emit(`stream:${submissionId}`, {
        progress: 100,
        log: `[CRITICAL ERROR] Execution failed: ${error.message}`,
        completed: true,
        report: {
          peakTps: 0,
          avgLatencyP50: "N/A",
          avgLatencyP99: "N/A",
          correctnessScore: "0.00%",
          stability: "CRASHED",
          compositeScore: 0
        }
      });
    } finally {
      if (sandboxResult && sandboxResult.containerName) {
        await DockerSandboxManager.stopAndCleanup(sandboxResult.containerName);
      }
      const binaryToCleanup = this.activeJob?.binaryPath;
      
      if (binaryToCleanup && fs.existsSync(binaryToCleanup)) {
        // We use a 3-second delay (setTimeout)
        // Why? To allow the Docker daemon and Host OS to completely release all volume-mount file locks [2].
        setTimeout(() => {
          try {
            fs.unlinkSync(binaryToCleanup);
            console.log(`[CLEANUP] Host filesystem cleaned. Safely deleted binary: ${path.basename(binaryToCleanup)}`);
          } catch (cleanupError) {
            console.warn(`[CLEANUP WARNING] Failed to delete host binary ${path.basename(binaryToCleanup)}: `, cleanupError.message);
          }
        }, 2000); // 2 seconds delay
      }
      this.isProcessing = false;
      this.activeJob = null;
      this.processNext();
    }
  }

  /**
   * Spawns Bot process and simulates/pipes telemetry data to SSE clients in real-time [2].
   */
  async triggerBotFleetAndStream(port, submissionId){
    return new Promise((resolve,reject)=>{
      console.log(`calling StartLoad() of the go grpc server at the port ${port}`);
      client.StartLoad({URL:`ws://localhost:${port}/trade`},(err,response)=>{
        if(err!==null){
          console.log("failed to start load due to the error ",err);
          return reject(err);
        }
        console.log(`successfully start the load. ${response.Message}`);
        let secondPassed=0;
        let consecutiveFailure=0;
        const telemetryInterval= setInterval(async ()=>{
          secondPassed++;
          try{
            const multi=redisClient.multi();
            multi.lRange("telemetry_queue",0,-1);
            multi.del("telemetry_queue");
            const redisResult=await multi.exec();
            const rawData=redisResult[0]||[];
            let totalRequestSend=rawData.length;
            let successfulRequests=0;
            let latencies=[];
            for(let data of rawData){
              const parts=data.split(",");
              const latency=parseInt(parts[0]);
              const success=parseInt(parts[1]);
              if(success==1){
                successfulRequests++;
                latencies.push(latency);
              }
            }
            const throughput=successfulRequests;
            const accuracy=totalRequestSend>0?parseFloat(((throughput/totalRequestSend)*100).toFixed(2)):0;
            latencies.sort((a,b)=>a-b);
            const p50_lat=latencies.length>0?latencies[Math.floor(latencies.length*0.50)]:0;
            const p99_lat=latencies.length>0?latencies[Math.floor(latencies.length*0.99)]:0;
            console.log(`tps:${throughput},p50 latency ${p50_lat} p99 latency ${p99_lat} and accuracy ${accuracy}`);
            eventBus.emit(`stream:${submissionId}`,{
              progress: Math.min(secondPassed*2,99),
              completed:false,
              metrics:{tps:throughput,p50:p50_lat,p99: p99_lat,accuracy:accuracy},
              log:`[Telemetry] Load ${throughput} tps. p99 Latency ${p99_lat}ms`
            });
            const currentTime=new Date();
            try{
              await tsClient.query(`insert into metrics_trading_engine (submission_id,recorded_at,time_second,tps,p50_lat,p99_lat,accuracy) values($1,$2,$3,$4,$5,$6,$7)`,[submissionId,currentTime,secondPassed,throughput,
              p50_lat,p99_lat,accuracy
            ]);
            }catch(err){
              console.log("some error occur while storing data in timescaledb ",err);
            }
            consecutiveFailure=(throughput==0||accuracy<50||p99_lat>1500)?consecutiveFailure+1:0;
             if(secondPassed>5&&consecutiveFailure>=3){
              console.log("[Engine Crashed].Engine became dead under the heavy load");
              clearInterval(telemetryInterval);
              console.log(`calling StopLoad() of the go grpc server at the port ${port}`);
              client.StopLoad({Message:"Stop the test"},(err,response)=>{
                console.log("stopping the go bots");
                eventBus.emit(`stream:${submissionId}`,{
                  progress:100,
                  completed:true,
                  log:"[System] engine crashed under the increasing load",
                  report:{
                    peakTps:"check the final report",
                    avgLatencyP50:"check the final report",
                    avgLatencyP99:"check the final report",
                    correctnessScore:"check the final report",
                    stability:"crashed"
                  }
                });
                return resolve("Test_Completed");
              });
            }
          }catch(redisErr){
            console.log("some error occured while fetching data from redis ",redisErr);
          }
        },1000)
      });
    });
  }
}

const queueInstance = new SubmissionQueueManager();
export default queueInstance;