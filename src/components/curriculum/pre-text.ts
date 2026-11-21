/**
 * Text shown in a <pre>, with Windows line endings written as plain newlines. An HTML parser drops one newline right
 * after <pre> and reads \r\n as \n; React's server render adds that extra newline only when the text starts with \n,
 * so a test input that starts with \r\n lost its first line break in the HTML and failed hydration (React #418). The
 * carriage return is invisible on the page anyway; the automated checks still run on the raw text.
 */
export const shownText = (text: string) => text.replace(/\r\n?/g, '\n');
