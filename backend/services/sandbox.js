import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import net from 'net'; // Native Node.js module to query OS for free ports

/**
 * DockerSandboxManager handles container lifecycle with dynamic port allocation.
 * Designed using SOLID principles to isolate sandbox environments.
 */
class DockerSandboxManager {
  // Sandbox Configuration Limits (As per requirements)
  static MEMORY_LIMIT = '512m';
  static CPU_LIMIT = '1';
  static BASE_IMAGE = 'iicpc-sandbox-base:latest';
  static CONTAINER_PORT = '8080'; // The standard internal port of contestant matching engines

  /**
   * Helper utility that queries the OS kernel for a guaranteed free TCP port.
   * Prevents port conflicts when scaling concurrent tests.
   * 
   * @returns {Promise<number>} Ephemeral open port
   */
  static async getFreePort() {
    return new Promise((resolve, reject) => {
      const server = net.createServer();
      server.unref();
      server.on('error', reject);
      server.listen(0, () => {
        const { port } = server.address();
        server.close(() => {
          resolve(port);
        });
      });
    });
  }

  /**
   * Spins up sandbox with dynamic port mapping (hostPort -> containerPort).
   * Uses spawn instead of exec to guarantee shell injection prevention.
   * 
   * @param {string} teamName - Name of the contestant team
   * @param {string} submissionId - Unique ID of the submission
   * @param {string} hostBinaryPath - Absolute path of the executable on the host
   * @returns {Promise<{containerName: string, containerId: string, mappedPort: number}>}
   */
  static async runContainer(teamName, submissionId, hostBinaryPath) {
    const cleanTeamName = teamName.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    const containerName = `sandbox-${cleanTeamName}-${submissionId}`;

    if (!fs.existsSync(hostBinaryPath)) {
      throw new Error(`Execution error: Binary not found at path: ${hostBinaryPath}`);
    }

    try {
      // Apply execution bit to make the binary executable on Linux
      fs.chmodSync(hostBinaryPath, 0o755); 
    } catch (chmodError) {
      console.warn(`[SANDBOX WARNING] Failed to set +x permission on host file:`, chmodError.message);
    }

    // 1. DYNAMICALLY ALLOCATE FREE PORT ON THE HOST
    let hostPort;
    try {
      hostPort = await this.getFreePort();
      console.log(`[SANDBOX] Ephemeral port allocated: ${hostPort} -> mapped to internal container port: ${this.CONTAINER_PORT}`);
    } catch (portError) {
      throw new Error(`Port allocation failed: ${portError.message}`);
    }

    // 2. Prepare Docker arguments with Port Forwarding parameter
    const args = [
      'run',
      '-d',
      '--name', containerName,
      '--memory', this.MEMORY_LIMIT,
      '--cpus', this.CPU_LIMIT,
      '-p', `${hostPort}:${this.CONTAINER_PORT}`, // Forwarding: Host -> Container
      '-v', `${path.resolve(hostBinaryPath)}:/app/my_engine`,
      this.BASE_IMAGE,
      '/app/my_engine'
    ];

    return new Promise((resolve, reject) => {
      console.log(`[SANDBOX] Initializing run: ${containerName} (Port: ${hostPort})`);
      
      const dockerProcess = spawn('docker', args);
      let stdout = '';
      let stderr = '';

      dockerProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      dockerProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      dockerProcess.on('close', (code) => {
        if (code === 0) {
          const containerId = stdout.trim();
          console.log(`[SANDBOX] Container spawned. ID: ${containerId}`);
          resolve({ containerName, containerId, mappedPort: hostPort });
        } else {
          console.error(`[SANDBOX] Process failed. Code: ${code}. Error: ${stderr}`);
          reject(new Error(`Sandbox startup error: ${stderr.trim()}`));
        }
      });
      //resolve(true);
    });
  }

  /**
   * Forcefully kills and removes the container from Docker environment.
   * 
   * @param {string} containerName 
   * @returns {Promise<boolean>}
   */
  static async stopAndCleanup(containerName) {
    return new Promise((resolve) => {
      console.log(`[SANDBOX] Destroying container: ${containerName}`);
      const dockerProcess = spawn('docker', ['rm', '-f', containerName]);
      dockerProcess.on('close', (code) => {
        if (code === 0) {
          console.log(`[SANDBOX] Cleanup complete for: ${containerName}`);
          resolve(true);
        } else {
          console.warn(`[SANDBOX] Failed to completely remove container: ${containerName}`);
          resolve(false);
        }
      });
    });
  }
}

export default DockerSandboxManager;