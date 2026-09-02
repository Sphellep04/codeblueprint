/** Tiny, dependency-free ANSI helper. Every wrapper checks process.stdout.isTTY at call time (not
 * once at module load) so piped output — most importantly the --json scripting path, which never
 * calls these at all, but also `codeblueprint . | less` etc — never gets escape codes mixed into
 * machine-readable or redirected text. */
function wrap(code: string, text: string): string {
  return process.stdout.isTTY ? `\x1b[${code}m${text}\x1b[0m` : text;
}

export const bold = (text: string): string => wrap("1", text);
export const warn = (text: string): string => wrap("33", text);
export const dim = (text: string): string => wrap("2", text);
