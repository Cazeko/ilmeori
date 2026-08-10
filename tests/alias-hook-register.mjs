/** 해석 훅을 켠다. `node --import ./tests/alias-hook-register.mjs …` 로 쓴다. */
import { register } from "node:module";
register("./alias-hook.mjs", import.meta.url);
