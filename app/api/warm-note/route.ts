export async function POST(req: Request) {
  const { note, caregiverName, language } = await req.json();

  try {
    const res = await fetch(
      'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.DASHSCOPE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'qwen-turbo',
          messages: [
            {
              role: 'system',
              content: `Rewrite the note as ONE warm, simple sentence for a person with dementia, in ${language === 'ur' ? 'Urdu' : 'English'}. Begin with "This is a recording from ${caregiverName} to help you". Keep it under 20 words. Never give medical advice.`,
            },
            { role: 'user', content: note },
          ],
        }),
      }
    );
    const data = await res.json();
    const warm = data?.choices?.[0]?.message?.content ?? note;
    return Response.json({ warm });
  } catch {
    return Response.json({ warm: note });   // if the AI fails, just use the raw note
  }
}