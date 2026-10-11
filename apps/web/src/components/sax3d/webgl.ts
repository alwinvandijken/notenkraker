/** Kan dit apparaat WebGL tekenen? Zo niet, dan toont de grepentabel de eenvoudige tekening. */
export function hasWebGL(): boolean {
  try {
    const c = document.createElement("canvas");
    return Boolean(c.getContext("webgl2") ?? c.getContext("webgl"));
  } catch {
    return false;
  }
}
