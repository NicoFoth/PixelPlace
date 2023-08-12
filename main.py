import threading
import db_listener
import ui


def main() -> None:
    listener_thread = threading.Thread(target=db_listener.main)
    listener_thread.start()
    ui.startUI()

if __name__ == "__main__":
    main()
