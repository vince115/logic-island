import { Fragment } from 'react';

/** Lesson text with `inline code` between backticks. Works in server and client components. */
export function Rich({ text }: { text: string }) {
  return <>{text.split('`').map((part, i) => i % 2 ? <code key={i}>{part}</code> : <Fragment key={i}>{part}</Fragment>)}</>;
}
