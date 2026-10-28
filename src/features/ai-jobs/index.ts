// Client-safe entry: types and domain (AD-1).
export {
  aiJobKinds,
  aiJobSchema,
  aiJobStatuses,
  type AiJob,
  type AiJobKind,
  type AiJobStatus,
} from "./domain/ai-job";
export {
  doingText,
  finishedText,
  jobRowText,
  resultHref,
  severalFinishedText,
  statusText,
  subjectText,
  waitingText,
} from "./domain/ai-job-text";
