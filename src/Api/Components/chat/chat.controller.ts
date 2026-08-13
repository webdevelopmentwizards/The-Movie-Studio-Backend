import { Response } from 'express';
import OpenAI from 'openai';
import asyncHandler from '../../../helpers/async';
import { BadRequestError, InternalError } from '../../../core/ApiError';
import { SuccessResponse } from '../../../core/ApiResponse';

const MAX_MESSAGES = 20;
const MAX_MESSAGE_LENGTH = 2000;

type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

function buildSystemPrompt(): string {
  return `You are the official AI assistant for The Movie Studio website. Help visitors with movies, membership, auditions, contact, and company info.

STRICT RULES:
1. Only answer questions related to The Movie Studio, its films, membership, auditions, and site features.
2. Do not invent movies that are not on the site. Suggest browsing /movies when unsure.
3. Be concise and friendly. Use Markdown with bold titles and internal links like [Browse movies](/movies).
4. You cannot submit forms, process payments, or change accounts — direct users to the relevant page.
5. Company: The Movie Studio, Inc. (OTC: MVES), Ft. Lauderdale, Florida. Contact: info@themoviestudio.com. Membership: $9.99/mo or $89.99/yr.
6. Auditions can be submitted from the homepage. Contact form is at /contact.`;
}

export class ChatController {
  chat = asyncHandler(async (req: any, res: Response) => {
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) {
      throw new InternalError('Assistant is not configured. Please add OPENAI_API_KEY.');
    }

    const messages = req.body?.messages as ChatMessage[] | undefined;
    if (!Array.isArray(messages) || messages.length === 0) {
      throw new BadRequestError('Messages are required.');
    }

    const sanitized = messages
      .filter(
        (msg): msg is ChatMessage =>
          !!msg &&
          (msg.role === 'user' || msg.role === 'assistant') &&
          typeof msg.content === 'string' &&
          msg.content.trim().length > 0,
      )
      .slice(-MAX_MESSAGES)
      .map((msg) => ({
        role: msg.role,
        content: msg.content.trim().slice(0, MAX_MESSAGE_LENGTH),
      }));

    if (sanitized.length === 0 || sanitized[sanitized.length - 1].role !== 'user') {
      throw new BadRequestError('A user message is required.');
    }

    try {
      const openai = new OpenAI({ apiKey });
      const completion = await openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        temperature: 0.3,
        max_tokens: 600,
        messages: [{ role: 'system', content: buildSystemPrompt() }, ...sanitized],
      });

      const reply = completion.choices[0]?.message?.content?.trim();
      if (!reply) {
        throw new InternalError('No response from assistant.');
      }

      return new SuccessResponse('OK', { reply }).send(res);
    } catch (error) {
      if (error instanceof BadRequestError || error instanceof InternalError) throw error;
      throw new InternalError('Something went wrong. Please try again.');
    }
  });
}
