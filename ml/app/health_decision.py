from dataclasses import dataclass

from .config import Settings, get_settings


@dataclass(frozen=True)
class DecisionThresholds:
    health_warning: float
    health_critical: float
    risk_warning: float
    risk_critical: float


@dataclass(frozen=True)
class HealthDecision:
    health_score: float
    status: str
    recommendation: str


def decide_health(
    failure_probability: float,
    anomaly_score: float | None,
    settings: Settings | None = None,
    thresholds: DecisionThresholds | None = None,
) -> HealthDecision:
    settings = settings or get_settings()
    if not 0 <= failure_probability <= 1:
        raise ValueError("failure_probability must be between 0 and 1")
    if anomaly_score is not None and not 0 <= anomaly_score <= 1:
        raise ValueError("anomaly_score must be between 0 and 1")
    if anomaly_score is None:
        risk = failure_probability
    else:
        total_weight = settings.failure_weight + settings.anomaly_weight
        if total_weight <= 0:
            raise ValueError("health decision weights must sum to a positive value")
        risk = (
            settings.failure_weight * failure_probability
            + settings.anomaly_weight * anomaly_score
        ) / total_weight
    score = round(max(0.0, min(100.0, 100.0 * (1.0 - risk))), 2)
    limits = thresholds or DecisionThresholds(
        health_warning=settings.healthy_threshold,
        health_critical=settings.warning_threshold,
        risk_warning=settings.risk_warning_threshold,
        risk_critical=settings.critical_failure_threshold * 100,
    )
    failure_risk = failure_probability * 100
    if score <= limits.health_critical or failure_risk >= limits.risk_critical:
        status = "critical"
        recommendation = "Stop or reduce operation and inspect the machine immediately."
    elif score <= limits.health_warning or failure_risk >= limits.risk_warning:
        status = "warning"
        recommendation = "Inspect the machine soon and schedule preventive maintenance."
    else:
        status = "healthy"
        recommendation = "Continue normal operation and routine maintenance."
    return HealthDecision(score, status, recommendation)
