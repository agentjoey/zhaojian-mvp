/**
 * 重试 + 退避（EP-512）：LLM 端点偶发瞬时失败（socket closed / 5xx / 429）。
 * 网络错误(无 status)与 5xx/429 重试；4xx 不重试；尊重调用方 signal。
 */

export function isRetryableError(e: unknown): boolean {
  const status = (e as { status?: number })?.status;
  if (typeof status === "number") return status === 429 || status >= 500; // 4xx（含 401/400）不重试
  return true; // fetch/网络错误（无 status）→ 可重试
}

export type RetryOpts = {
  retries?: number;
  retryable?: (e: unknown) => boolean;
  /** 每次重试前回调（默认指数退避 sleep）；测试注入空实现以免真睡。 */
  onRetry?: (attempt: number) => Promise<void>;
};

const defaultBackoff = (attempt: number) =>
  new Promise<void>((r) => setTimeout(r, 300 * 2 ** attempt)); // 300ms, 600ms, ...

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOpts = {}): Promise<T> {
  const retries = opts.retries ?? 2;
  const retryable = opts.retryable ?? (() => true);
  const onRetry = opts.onRetry ?? defaultBackoff;
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (attempt >= retries || !retryable(e)) throw e;
      await onRetry(attempt);
    }
  }
}
