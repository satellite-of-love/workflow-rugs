
export function toEmoji(s: string): string {
    let validEmojiName = s.replace(":", "-").toLowerCase();
    return `:${validEmojiName}:`;
}