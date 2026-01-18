import OpenAI from 'openai';
import { BattleReportExtractionSchema } from '@/types/ai-response';
import type { BattleReport } from '@/types/battle-report';
import type { VideoData } from '@/types/youtube';

const SYSTEM_PROMPT = `You are an expert at analyzing Warhammer 40,000 battle report videos. Your task is to extract structured information about the armies, units, and stratagems mentioned.

You must respond with a valid JSON object containing the extracted battle report data.

Guidelines:
- Extract player names and their factions accurately
- Identify all units mentioned with their owner (player 0 or 1)
- Note any stratagems used or mentioned
- Assign confidence levels based on how clearly the information was stated:
  - "high": Explicitly stated in description or clearly mentioned multiple times
  - "medium": Mentioned once or inferred from context
  - "low": Uncertain or partially mentioned
- If the video title or description mentions a specific faction matchup, prioritize that information
- Common faction names: Space Marines, Orks, Aeldari, Tyranids, Chaos Space Marines, Death Guard, Necrons, T'au Empire, Adeptus Mechanicus, Imperial Knights, etc.

Focus on accuracy over completeness. Only include information you're confident about.

Your JSON response must include: players (array with name, faction, detachment, confidence), units (array with name, playerIndex, confidence, pointsCost), stratagems (array with name, playerIndex, confidence), mission (optional string), and pointsLimit (optional number).`;

function buildUserPrompt(videoData: VideoData): string {
  let prompt = `Analyze this Warhammer 40,000 battle report video and extract the army lists and game information.

VIDEO TITLE: ${videoData.title}

CHANNEL: ${videoData.channel}

DESCRIPTION:
${videoData.description}
`;

  if (videoData.chapters.length > 0) {
    prompt += `\n\nCHAPTERS:\n`;
    for (const chapter of videoData.chapters) {
      const minutes = Math.floor(chapter.startTime / 60);
      const seconds = chapter.startTime % 60;
      prompt += `${minutes}:${seconds.toString().padStart(2, '0')} - ${chapter.title}\n`;
    }
  }

  if (videoData.pinnedComment) {
    prompt += `\n\nPINNED COMMENT:\n${videoData.pinnedComment}`;
  }

  if (videoData.transcript.length > 0) {
    // Only use first few minutes and key sections of transcript to stay within token limits
    const transcriptText = videoData.transcript
      .filter((seg) => seg.startTime < 300) // First 5 minutes
      .map((seg) => seg.text)
      .join(' ')
      .slice(0, 3000);

    prompt += `\n\nTRANSCRIPT (first 5 minutes):\n${transcriptText}`;
  }

  return prompt;
}

export async function extractBattleReport(
  videoData: VideoData,
  apiKey: string
): Promise<BattleReport> {
  const openai = new OpenAI({ apiKey });

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0.1,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildUserPrompt(videoData) },
    ],
    response_format: { type: 'json_object' },
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('No response from AI');
  }

  const parsed = JSON.parse(content);
  const validated = BattleReportExtractionSchema.parse(parsed);

  // Convert to BattleReport format (convert null to undefined)
  const report: BattleReport = {
    players: validated.players.map((p) => ({
      name: p.name,
      faction: p.faction,
      detachment: p.detachment ?? undefined,
      confidence: p.confidence,
    })) as BattleReport['players'],
    units: validated.units.map((u) => ({
      name: u.name,
      playerIndex: u.playerIndex,
      confidence: u.confidence,
      pointsCost: u.pointsCost ?? undefined,
    })),
    stratagems: validated.stratagems.map((s) => ({
      name: s.name,
      playerIndex: s.playerIndex ?? undefined,
      confidence: s.confidence,
    })),
    mission: validated.mission ?? undefined,
    pointsLimit: validated.pointsLimit ?? undefined,
    extractedAt: Date.now(),
  };

  return report;
}
