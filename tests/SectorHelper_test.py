import unittest

from src import SectorHelper


class ClearCacheTest(unittest.TestCase):

    def setUp(self) -> None:
        self.helper = SectorHelper.SectorHelper()
        self.helper.sector_cache = {
            "1,1": SectorHelper.db_handler.Sector.Sector()
        }

    def tearDown(self) -> None:
        self.helper.sector_cache = {}

    def test_clearCache(self) -> None:
        self.helper.clearCache()
        self.assertEqual(self.helper.sector_cache, {})


class AddToCacheTest(unittest.TestCase):

    def setUp(self) -> None:
        self.helper = SectorHelper.SectorHelper()
        self.helper.sector_cache = {}

    def tearDown(self) -> None:
        self.helper.sector_cache = {}

    def test_addToCache(self) -> None:
        sector = SectorHelper.db_handler.Sector.Sector()
        sector.scoord_x = 0
        sector.scoord_y = 1
        self.helper.addToCache(sector)
        self.assertEqual(self.helper.sector_cache, {"0,1": sector})


class RemoveFromCacheTest(unittest.TestCase):

    def setUp(self) -> None:
        self.helper = SectorHelper.SectorHelper()
        self.helper.sector_cache = {}

    def tearDown(self) -> None:
        self.helper.sector_cache = {}

    def test_removeFromCacheNonExistent(self) -> None:
        # Test removing a sector that doesn't exist
        self.helper.removeFromCache(1, 1)
        self.assertEqual(self.helper.sector_cache, {})

    def test_removeFromCacheExistent(self) -> None:
        # Test removing a sector that does exist
        self.helper.sector_cache = {
            "1,1": SectorHelper.db_handler.Sector.Sector()
        }
        self.helper.removeFromCache(1, 1)
        self.assertEqual(self.helper.sector_cache, {})

    def test_removeFromCacheExistentNotOnly(self) -> None:
        # Test removing a sector that does exist, but isn't the only one
        sector1 = SectorHelper.db_handler.Sector.Sector()
        sector2 = SectorHelper.db_handler.Sector.Sector()
        self.helper.sector_cache = {"1,1": sector1, "2,2": sector2}
        self.helper.removeFromCache(1, 1)
        self.assertEqual(self.helper.sector_cache, {"2,2": sector2})


class CreateSectorTest(unittest.TestCase):

    def setUp(self) -> None:
        self.helper = SectorHelper.SectorHelper()

    def test_createSector(self) -> None:
        sector = self.helper.createSector(1, 1)
        self.assertEqual(sector.scoord_x, 1)
        self.assertEqual(sector.scoord_y, 1)


if __name__ == "__main__":
    unittest.main()