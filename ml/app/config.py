from dataclasses import dataclass
import os
import math


@dataclass(frozen=True)
class Settings:
    failure_threshold: float = 0.50
    failure_weight: float = 0.60
    anomaly_weight: float = 0.40
    healthy_threshold: float = 70.0
    warning_threshold: float = 40.0

    def __post_init__(self) -> None:
        if not 0 <= self.failure_threshold <= 1:
            raise ValueError("failure_threshold must be between 0 and 1")
        if (
            not math.isfinite(self.failure_weight)
            or not math.isfinite(self.anomaly_weight)
            or self.failure_weight < 0
            or self.anomaly_weight < 0
            or self.failure_weight + self.anomaly_weight <= 0
        ):
            raise ValueError("health weights must be finite, non-negative, and sum to a positive value")
        if not 0 <= self.warning_threshold <= self.healthy_threshold <= 100:
            raise ValueError("health thresholds must satisfy 0 <= warning <= healthy <= 100")


def get_settings() -> Settings:
    return Settings(
        failure_threshold=float(os.getenv("FAILURE_THRESHOLD", "0.50")),
        failure_weight=float(os.getenv("HEALTH_FAILURE_WEIGHT", "0.60")),
        anomaly_weight=float(os.getenv("HEALTH_ANOMALY_WEIGHT", "0.40")),
        healthy_threshold=float(os.getenv("HEALTHY_SCORE_THRESHOLD", "70")),
        warning_threshold=float(os.getenv("WARNING_SCORE_THRESHOLD", "40")),
    )
