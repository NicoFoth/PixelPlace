import time
from fireo import models, fields

class Sector(models.Model):

    # Sector coordinates
    scoord_x = fields.NumberField(required=True, int_only=True)
    scoord_y = fields.NumberField(required=True, int_only=True)
    # Dictionary of pixel objects in sector
    pixels = fields.MapField(required=True)
    # Time of last update in the sector
    last_update = fields.DateTime(required=True)
