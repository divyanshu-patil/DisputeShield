// Entry point for the Render workflow service. Importing the module registers every task; the SDK
// starts the task server automatically when RENDER_SDK_SOCKET_PATH is set ✅ (SDK README).
// Render start command: `node apps/workflows/dist/index.js`.
import { buildHandlers } from "./handlers.js";
import { buildTasks } from "./tasks.js";

export const tasks = buildTasks(buildHandlers());
