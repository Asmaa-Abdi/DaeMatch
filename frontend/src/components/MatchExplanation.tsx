import { Check, Plus } from 'lucide-react';

import type { JobMatch } from '../types';

interface MatchExplanationProps {
  match: JobMatch;
}

const skillKey = (name: string) => name.trim().toLocaleLowerCase();

export function MatchExplanation({ match }: MatchExplanationProps) {
  const matchedKeys = new Set(match.matched_skills.map(skillKey));
  const matched = match.required_skills.filter((skill) => matchedKeys.has(skillKey(skill.name)));
  const missing = match.required_skills.filter((skill) => !matchedKeys.has(skillKey(skill.name)));
  const hasRequirements = match.required_skill_count > 0;
  const canCalculateFormula = hasRequirements && match.developer_skill_count > 0;

  return (
    <section className="match-explanation" aria-label="Why this job received its match score">
      <div className="match-explanation__summary">
        <strong>{hasRequirements ? `${matched.length} of ${match.required_skill_count} required skills match` : 'No required skills are listed for this role'}</strong>
        <span>{hasRequirements ? 'Based on skills in your profile' : 'A skills-based fit score cannot be calculated yet.'}</span>
      </div>

      {hasRequirements && <>
        <div className="match-explanation__groups">
          {matched.length > 0 && <div className="match-explanation__group">
            <span className="match-explanation__label">In your profile</span>
            <div className="match-explanation__skills">
              {matched.map((skill) => <span className="match-skill-chip match-skill-chip--matched" key={skill.id}><Check size={11} aria-hidden="true" />{skill.name}</span>)}
            </div>
          </div>}
          {missing.length > 0 && <div className="match-explanation__group">
            <span className="match-explanation__label">Not listed yet</span>
            <div className="match-explanation__skills">
              {missing.map((skill) => <span className="match-skill-chip match-skill-chip--missing" key={skill.id}><Plus size={11} aria-hidden="true" />{skill.name}</span>)}
            </div>
          </div>}
        </div>

        <details className="match-explanation__details">
          <summary>How was this score calculated?</summary>
          {canCalculateFormula ? <p className="match-explanation__calculation">
            Required-skill coverage: {matched.length} matched unique requirements ÷ {match.required_skill_count} unique role requirements × 100 = {match.match_score.toFixed(1)}%.
          </p> : <p className="match-explanation__calculation">Add the skills you have to your profile to calculate a skills-based fit score.</p>}
          <p className="match-explanation__note">Only skills listed in your profile are compared; your CV file is not automatically read for skills. After updating skills in Profile, choose “Refresh matches” to recalculate.</p>
        </details>
      </>}
    </section>
  );
}
