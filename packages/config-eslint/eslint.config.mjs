import { base } from "./base.mjs";
import { noProcessEnv } from "./boundaries.mjs";

export default [...base, noProcessEnv()];
