from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from app.database import get_db
from app.core.security import decode_token
from app.domain.models import User

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

def get_current_user_from_token(token: str, db: Session) -> User:
    """
    Valida un token JWT en texto y recupera el usuario correspondiente de la BD.
    Se utiliza tanto en OAuth2 Bearer estándar como en WebSockets y endpoints de streaming
    donde el token puede provenir de parámetros de consulta (query param).
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Credenciales inválidas o sesión expirada.",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    if not token:
        raise credentials_exception
    
    payload = decode_token(token)
    if payload is None:
        raise credentials_exception
    
    user_id_raw = payload.get("sub")
    if user_id_raw is None:
        raise credentials_exception
    
    try:
        user_id = int(user_id_raw)
    except (ValueError, TypeError):
        raise credentials_exception
    
    user = db.query(User).filter(User.id == user_id).first()
    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Usuario inactivo o no autorizado. Contacte al Administrador."
        )
    return user

def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    """Dependencia estándar OAuth2 Bearer para protección de endpoints REST"""
    return get_current_user_from_token(token=token, db=db)

def require_admin(current_user: User = Depends(get_current_user)) -> User:
    """Dependencia RBAC que restringe el acceso exclusivamente a usuarios con rol 'admin'"""
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Se requieren privilegios de Administrador para esta acción."
        )
    return current_user
