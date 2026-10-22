from collections.abc import Callable


class SearchCancelled(Exception):
    pass


def check_cancellation(should_cancel: Callable[[], bool] | None) -> None:
    if should_cancel is not None and should_cancel():
        raise SearchCancelled("Search cancelled.")
