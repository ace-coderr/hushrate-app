import { hourLabel } from "../lib/time";

/** Opening paragraph of the Frontier check. hourLabel already ends with UTC, so no zone is written around it. */
export function FrontierIntro({ assistant, intervalStart, recordedAt, blockHeight }: { assistant: string; intervalStart: string; recordedAt: string; blockHeight: number | null }) {
  return (
    <p>
      Telegraph asked builders to compare against strong frontier models. Here is what {assistant} answered for Bitcoin's price and hashprice,
      next to the value Hushrate bought from Telegraph and the public value, for the same hour: the {hourLabel(intervalStart)} interval
      (tape recorded {hourLabel(recordedAt)}, block {blockHeight === null ? "n/a" : blockHeight.toLocaleString("en-GB")}).
    </p>
  );
}
