import { z } from "zod";

export const transcriptSegmentShape = z.object({
  text: z.string(),
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().nonnegative(),
  confidence: z.number().min(0).max(1),
  speaker: z.string().optional(),
});
export type TranscriptSegment = z.infer<typeof transcriptSegmentShape>;

export const transcriptShape = z.object({
  segments: z.array(transcriptSegmentShape),
  durationMs: z.number().int().nonnegative(),
});
export type Transcript = z.infer<typeof transcriptShape>;
