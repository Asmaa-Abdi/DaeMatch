import { Link } from 'react-router-dom';

interface BrandProps {
  inverse?: boolean;
  compact?: boolean;
  to?: string;
}

export function Brand({ inverse = false, compact = false, to = '/' }: BrandProps) {
  return (
    <Link className={`brand${inverse ? ' brand--inverse' : ''}${compact ? ' brand--compact' : ''}`} to={to} aria-label="DAEMatch home">
      <span className="brand-mark" aria-hidden="true"><span /><span /><i /></span>
      <span className="brand-word">DAE<span>Match</span></span>
    </Link>
  );
}
