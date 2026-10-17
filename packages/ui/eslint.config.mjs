import { base } from "@ds/config-eslint/base";
import { noProcessEnv, ui } from "@ds/config-eslint/boundaries";

export default [...base, ui, noProcessEnv()];
