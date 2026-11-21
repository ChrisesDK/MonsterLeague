[out:json][timeout:180];
(
  way["highway"~"^(motorway|trunk|primary|secondary)$"](55.35,10.30,55.43,10.47);
  way["railway"="rail"](55.35,10.30,55.43,10.47);
  way["waterway"~"^(river|canal)$"](55.35,10.30,55.43,10.47);
  nwr["name"~"^(Munke Mose|H\.? ?C\.? Andersens Hus|Sankt Knuds Kirke|Skt\. Knuds Kirke|Odense Domkirke|Sankt Knuds Plads|Skt\. Knuds Plads|Havnebadet|Odense Havnebad|Fruens Bøge|Odense Zoo|Den Fynske Landsby|Kongens Have)"](55.35,10.30,55.43,10.47);
);
out geom tags;
