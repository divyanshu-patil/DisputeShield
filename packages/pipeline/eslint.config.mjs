import { base } from "@ds/config-eslint/base";
import { noProcessEnv } from "@ds/config-eslint/boundaries";

export default [...base, noProcessEnv()];
