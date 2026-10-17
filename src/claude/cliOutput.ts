export type CliErrorKind =
  | 'NOT_INSTALLED'
  | 'NOT_LOGGED_IN'
  | 'OUTDATED'
  | 'USAGE_LIMIT'
  | 'TIMEOUT'
  | 'CANCELLED'
  | 'UNKNOWN';

export interface CliResult {
  text: string;
  isError: boolean;
  apiStatus: number | null;
  structured: unknown;
  /** Tool calls the CLI refused (agent mode); logged for transparency. */
  denials: number;
}

/** Parses `claude -p --output-format json`. Scans from the end for the result object. */
export function parseCliJson(stdout: string): CliResult | undefined {
  const lines = stdout.split('\n').map((l) => l.trim()).filter((l) => l.startsWith('{'));
  for (const candidate of [stdout.trim(), ...lines.reverse()]) {
    try {
      const d = JSON.parse(candidate) as Record<string, unknown>;
      if (d['type'] === 'result' || 'result' in d) {
        return {
          text: typeof d['result'] === 'string' ? d['result'] : '',
          isError: d['is_error'] === true,
          apiStatus: typeof d['api_error_status'] === 'number' ? d['api_error_status'] : null,
          structured: d['structured_output'],
          denials: Array.isArray(d['permission_denials']) ? d['permission_denials'].length : 0,
        };
      }
    } catch {
      // not JSON; keep looking
    }
  }
  return undefined;
}

/** Maps a failed run to a kind the UI knows how to explain. */
export function classifyFailure(f: {
  spawnErrorCode?: string;
  stderr: string;
  resultText?: string;
  apiStatus?: number | null;
}): CliErrorKind {
  if (f.spawnErrorCode === 'ENOENT' || f.spawnErrorCode === 'EACCES') {
    return 'NOT_INSTALLED';
  }
  const text = `${f.resultText ?? ''}\n${f.stderr}`;
  if (/unknown option|unknown command|invalid choice/i.test(f.stderr)) {
    return 'OUTDATED'; // a flag we rely on doesn't exist in this CLI version
  }
  if (
    f.apiStatus === 401 ||
    /not logged in|please run \/login|invalid api key|oauth token (has )?expired|authentication_error/i.test(text)
  ) {
    return 'NOT_LOGGED_IN';
  }
  if (
    f.apiStatus === 429 ||
    /usage limit|limit reached|hit your (usage )?limit|rate[_ ]limit|out of (extra )?usage/i.test(text)
  ) {
    return 'USAGE_LIMIT';
  }
  return 'UNKNOWN';
}
