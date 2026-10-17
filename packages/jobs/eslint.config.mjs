import { base } from "@ds/config-eslint/base";
import { jobs, noProcessEnv } from "@ds/config-eslint/boundaries";

export default [...base, jobs, noProcessEnv()];
