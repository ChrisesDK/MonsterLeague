[out:json][timeout:180];
(
  way["highway"~"^(tertiary|tertiary_link)$"](55.35,10.30,55.43,10.47);
  way["highway"]["name"~"^(Klostervej|Kongensgade|Vestergade|Overgade|Nørregade|Vestre Stationsvej|Østre Stationsvej|Dannebrogsgade|Sejerskovvej|Fruens Bøge Allé|Dalumvej|Hunderupvej|Ansgargade|Jernbanegade|Flakhaven|Klosterbakken|Nedergade|Gravene|Slotsgade|Asylgade|Brandts Passage|Pantheonsgade|Sankt Knuds Kirkestræde)$"](55.38,10.36,55.41,10.41);
);
out geom tags;
