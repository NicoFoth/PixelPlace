from typing import Dict, Tuple, Any
from fireo import models, fields

class Sector(models.Model):

    # Sector coordinates
    scoord_x: int = fields.NumberField(required=True, int_only=True) #type: ignore
    scoord_y: int = fields.NumberField(required=True, int_only=True) #type: ignore
    # Dictionary of pixel objects in sector
    pixels: Dict[str, Tuple[int, int, int]] = fields.MapField(required=True) #type: ignore
    # Time of last update in the sector
    last_update: Any = fields.DateTime(required=True)
