/** Extract one contact from multi-hit cues; keep casting and bare hands intact. */
export function singleToolStrikeBuffer(buffer: AudioBuffer, kind: string, context: Pick<AudioContext, "createBuffer">): AudioBuffer {
  if (kind !== "axe" && kind !== "pick") return buffer;
  // The axe recording has 50 ms of lead-in; the pick starts at contact.
  const start = Math.floor(buffer.sampleRate * (kind === "axe" ? .05 : 0));
  const frames = Math.max(1, Math.min(buffer.length - start, Math.floor(buffer.sampleRate * .30)));
  const single = context.createBuffer(buffer.numberOfChannels, frames, buffer.sampleRate);
  const fade = Math.min(frames, Math.floor(buffer.sampleRate * .02));
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const data = buffer.getChannelData(channel).slice(start, start + frames);
    for (let i = 0; i < fade; i++) data[frames - fade + i] *= (fade - 1 - i) / Math.max(1, fade - 1);
    single.copyToChannel(data, channel);
  }
  return single;
}
