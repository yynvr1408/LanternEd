from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.db.models.enums import UserRole, UserStatus


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    full_name: str
    email: str
    role: UserRole
    status: UserStatus
    phone: str | None = None
    whatsapp_opt_in: bool = False

    @model_validator(mode="before")
    @classmethod
    def _opt_in(cls, data):
        if hasattr(data, "whatsapp_opt_in_at"):
            return {"id": data.id, "full_name": data.full_name, "email": data.email, "role": data.role, "status": data.status,
                    "phone": data.phone, "whatsapp_opt_in": data.whatsapp_opt_in_at is not None}
        return data


class UserUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=1, max_length=255)
    # E.164 (+ then 8-15 digits). An empty string removes the number and switches WhatsApp notifications off.
    phone: str | None = Field(default=None, pattern=r"^(\+[1-9][0-9]{7,14})?$")
    whatsapp_opt_in: bool | None = None
