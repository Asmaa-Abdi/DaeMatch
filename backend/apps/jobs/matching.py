from collections.abc import Iterable


def _normalized_skill_names(skills: Iterable[str]) -> set[str]:
    return {name.strip().casefold() for name in skills if isinstance(name, str) and name.strip()}


def required_skill_coverage_score(developer_skills: Iterable[str], required_skills: Iterable[str]) -> float:
    """Return matched unique job requirements as a percentage of all unique requirements."""
    developer = _normalized_skill_names(developer_skills)
    required = _normalized_skill_names(required_skills)
    if not developer or not required:
        return 0.0
    return round(len(developer & required) / len(required) * 100, 1)
