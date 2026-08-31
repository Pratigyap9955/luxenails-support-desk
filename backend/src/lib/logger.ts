/* Tiny structured logger — keeps startup output readable without a dependency. */

const COLORS = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  rose: "\x1b[38;5;211m",
  gold: "\x1b[38;5;179m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
};

function stamp() {
  return `${COLORS.dim}${new Date().toISOString().slice(11, 19)}${COLORS.reset}`;
}

export const logger = {
  info: (scope: string, msg: string, extra?: unknown) =>
    console.log(`${stamp()} ${COLORS.rose}[${scope}]${COLORS.reset} ${msg}`, extra ?? ""),
  success: (scope: string, msg: string) =>
    console.log(`${stamp()} ${COLORS.green}[${scope}]${COLORS.reset} ${msg}`),
  warn: (scope: string, msg: string, extra?: unknown) =>
    console.warn(`${stamp()} ${COLORS.yellow}[${scope}]${COLORS.reset} ${msg}`, extra ?? ""),
  error: (scope: string, msg: string, extra?: unknown) =>
    console.error(`${stamp()} ${COLORS.red}[${scope}]${COLORS.reset} ${msg}`, extra ?? ""),
  banner: (lines: string[]) => {
    const width = Math.max(...lines.map((l) => l.length)) + 4;
    const bar = "─".repeat(width);
    console.log(`${COLORS.gold}╭${bar}╮${COLORS.reset}`);
    for (const line of lines) {
      console.log(
        `${COLORS.gold}│${COLORS.reset}  ${line.padEnd(width - 4)}  ${COLORS.gold}│${COLORS.reset}`,
      );
    }
    console.log(`${COLORS.gold}╰${bar}╯${COLORS.reset}`);
  },
};
