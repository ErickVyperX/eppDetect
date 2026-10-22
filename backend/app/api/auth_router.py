from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.domain.models import User
from app.schemas.auth import LoginRequest, TokenResponse, UserResponse
from app.core.security import verify_password, create_access_token
from app.api.deps import get_current_user

router = APIRouter(prefix="/auth", tags=["Autenticación"])

# Hash bcrypt precalculado con costo estándar (12 rounds) para igualar el tiempo de cómputo
# frente a usuarios inexistentes, mitigando ataques de timing para enumeración de correos.
DUMMY_HASH = "$2b$12$e8Y5t1hYt1hYt1hYt1hYt.1hYt1hYt1hYt1hYt1hYt1hYt1hYt1hY"

@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    """
    Inicio de sesión estricto mediante correo y contraseña pre-registrados en la base de datos.
    Mitiga timing attacks ejecutando siempre la verificación criptográfica.
    """
    user = db.query(User).filter(User.email == payload.email).first()
    target_hash = user.hashed_password if user else DUMMY_HASH
    valid_pwd = verify_password(payload.password, target_hash)

    if not user or not valid_pwd:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Correo o contraseña incorrectos. Si olvidó sus credenciales, contacte al Administrador del Sistema."
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Su cuenta ha sido desactivada. Comuníquese con el Administrador."
        )

    token = create_access_token(subject=user.id)
    return TokenResponse(
        access_token=token,
        token_type="bearer",
        user=UserResponse.model_validate(user)
    )

@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)):
    """Retorna los datos del supervisor autenticado actualmente"""
    return UserResponse.model_validate(current_user)
