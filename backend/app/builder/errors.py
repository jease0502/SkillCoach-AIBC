"""Builder errors. They are HTTPExceptions, so routes need no extra handler."""
from __future__ import annotations

from fastapi import HTTPException


class BuilderError(HTTPException):
    status_code = 400

    def __init__(self, detail: str):
        super().__init__(status_code=type(self).status_code, detail=detail)

    def __str__(self) -> str:
        return str(self.detail)


class NotFound(BuilderError):
    status_code = 404


class Conflict(BuilderError):
    status_code = 409


class ValidationFailed(BuilderError):
    status_code = 422

    def __init__(self, issues: list[str]):
        self.issues = issues
        super().__init__("; ".join(issues))


class GenerationError(BuilderError):
    status_code = 502
