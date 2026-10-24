/**
 * JPEG reading and writing in plain JavaScript. The library needs Node's
 * Buffer, which the phone's JavaScript engine doesn't have, so it is added here.
 */
import { Buffer } from 'buffer';
import { decode, encode } from 'jpeg-js';

const g = globalThis as { Buffer?: unknown };
if (!g.Buffer) g.Buffer = Buffer;

export { decode, encode };
