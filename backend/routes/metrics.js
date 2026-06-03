import express from "express";
import { tsClient} from "../server.js";

const router=express.Router();

router.get("/report/:submission_id",async (req,res)=>{
    try{
        const query=`
    select submission_id, max(tps) as peak_tps,
    round(avg(p50_lat)::numeric,2) as avg_p50_latency,
    round(avg(p99_lat)::numeric,2) as avg_p99_latency,
    round(avg(accuracy)::numeric,2) as final_accuracy,
    least(
    greatest(
    round((((max(tps)*(avg(accuracy)/100.0))-(avg(p99_lat)*10))/100.0)::numeric,0),0
    ),1000
  ) as composite_score
    from metrics_trading_engine where submission_id=$1 
    group by submission_id;
    `; 
    const result=await tsClient.query(query,[req.params.submission_id]);
    if(result.rows.length==0){
        return res.status(404).json({
            "message":"No data found",
            "success":false
        })
    }
    return res.status(200).json({
        "data":result.rows[0],
        "success":true,
    })
    }catch(err){
        console.log(err);
        return res.status(500).json({
            "message":"database error",
            "success":false
        })
    }
});

router.get("/leaderboard",async (req,res)=>{
    try{
         const query=`
    select
    s.team_id,
    m.submission_id,
    max(m.tps) as peak_tps,
    round(avg(m.p50_lat)::numeric,2) as avg_p50_latency,
    round(avg(m.p99_lat)::numeric,2) as avg_p99_latency,
    round(avg(m.accuracy)::numeric,2) as final_accuracy,
    least(
    greatest(
    round((((max(tps)*(avg(accuracy)/100.0))-(avg(p99_lat)*10))/100.0)::numeric,0),0
    ),1000
  ) as composite_score
    from metrics_trading_engine m
    join submissions s on m.submission_id=s.submission_id
    where m.recorded_at>=Now()-interval '1 hour'
    group by m.submission_id,s.team_id
    order by 
             composite_score desc,
             final_accuracy desc,
             avg_p99_latency desc,
             peak_tps desc;
    `;
    const result=await tsClient.query(query);
    return res.status(200).json({
        "data":result.rows,
        "success":true
    })
    }catch(err){
        console.log(err);
        return res.status(500).json({
            "message":"database error",
            "success":false
        })
    }
});

export default router;