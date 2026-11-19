import { NativeConnection, Worker } from '@temporalio/worker';
import * as activities from './temporal/activities';
import { TASK_QUEUE_NAME } from './temporal/client';
import dotenv from 'dotenv';

dotenv.config();

export async function runWorker() {
  const temporalAddress = process.env.TEMPORAL_ADDRESS || 'localhost:7233';
  console.log(`[Worker] Connecting to Temporal at ${temporalAddress}...`);

  const connection = await NativeConnection.connect({
    address: temporalAddress,
  });

  const worker = await Worker.create({
    connection,
    namespace: process.env.TEMPORAL_NAMESPACE || 'default',
    taskQueue: TASK_QUEUE_NAME,
    workflowsPath: require.resolve('./temporal/workflows'),
    activities,
  });

  console.log(`[Worker] Temporal worker started on queue: ${TASK_QUEUE_NAME}`);
  await worker.run();
}

if (require.main === module) {
  runWorker().catch((err) => {
    console.error('[Worker] Fatal error running worker:', err);
    process.exit(1);
  });
}
