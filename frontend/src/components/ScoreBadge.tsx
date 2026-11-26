export function scoreTone(score: number): string {
  if (score >= 75) return 'score--high';
  if (score >= 50) return 'score--mid';
  return 'score--low';
}

export function ScoreBadge({ score }: { score: number }) {
  return <span className={`score-badge ${scoreTone(score)}`}>{Math.round(score)}% match</span>;
}
