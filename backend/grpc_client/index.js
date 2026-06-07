import "dotenv/config"
import grpc from "@grpc/grpc-js";
import protoLoader from "@grpc/proto-loader";

const packageDefinition=protoLoader.loadSync("proto/main.proto");
const protoDescriptor=grpc.loadPackageDefinition(packageDefinition);
const loadgen=protoDescriptor.main;

export const client=new loadgen.LoadGeneration(
   process.env.GRPC_SERVER_URL,
    grpc.credentials.createInsecure()
)