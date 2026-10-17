import { base } from "@ds/config-eslint/base";
import { noProcessEnv, pure } from "@ds/config-eslint/boundaries";

export default [...base, pure, noProcessEnv()];
