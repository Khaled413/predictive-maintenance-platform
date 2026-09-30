from dataclasses import dataclass

from .config import Settings, get_settings


@dataclass(frozen=True)
class HealthDecision:
    health_score: float
    status: str
    recommendation: str


def decide_health(
    failure_probability: float,
    anomaly_score: float,
    settings: Settings | None = None,
) -> HealthDecision:
    settings = settings or get_settings()
    if not 0 <= failure_probability <= 1 or not 0 <= anomaly_score <= 1:
        raise ValueError("failure_probability and anomaly_score must be between 0 and 1")
    total_weight = settings.failure_weight + settings.anomaly_weight
    if total_weight <= 0:
        raise ValueError("health decision weights must sum to a positive value")
    risk = (
        settings.failure_weight * failure_probability
        + settings.anomaly_weight * anomaly_score
    ) / total_weight
    score = round(max(0.0, min(100.0, 100.0 * (1.0 - risk))), 2)
    if score >= settings.healthy_threshold:
        status = "healthy"
        recommendation = "Continue normal operation and routine maintenance."
    elif score >= settings.warning_threshold:
        status = "warning"
        recommendation = "Inspect the machine soon and schedule preventive maintenance."
    else:
        status = "critical"
        recommendation = "Stop or reduce operation and inspect the machine immediately."
    return HealthDecision(score, status, recommendation)
