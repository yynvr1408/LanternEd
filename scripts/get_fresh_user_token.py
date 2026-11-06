import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'backend')))
from app.db.session import SessionLocal
from app.db.models import User
from app.services import auth_service

def main():
    if len(sys.argv) < 2:
        print("Usage: python get_fresh_user_token.py <email>")
        sys.exit(1)
    email = sys.argv[1]
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == email).first()
        if not user:
            print(f"Error: user {email} not found", file=sys.stderr)
            sys.exit(1)
        token = auth_service.create_session(db, user)
        print(token)
    finally:
        db.close()

if __name__ == '__main__':
    main()
