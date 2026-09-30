"""Vercel entrypoint for the predictive-maintenance inference API."""

from app.api import app

__all__ = ["app"]