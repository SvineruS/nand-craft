import type { SerializedCircuit } from "../persistence/serialize.ts";

export const LEVEL_MAP_CIRCUIT: SerializedCircuit = ({
  "version": 1,
  "gates": [
    [
      "gate_1476",
      {
        "type": "level",
        "pos": {
          "x": 80,
          "y": 100
        },
        "rotation": 0,
        "inputPins": [
          "pin_1477"
        ],
        "outputPins": [
          "pin_1478"
        ],
        "label": "NOT",
        "status": "solved",
        "canRemove": false,
        "canMove": true
      }
    ],
    [
      "gate_1479",
      {
        "type": "level",
        "pos": {
          "x": 240,
          "y": 20
        },
        "rotation": 0,
        "inputPins": [
          "pin_1480"
        ],
        "outputPins": [
          "pin_1481"
        ],
        "label": "AND",
        "status": "solved",
        "canRemove": false,
        "canMove": true
      }
    ],
    [
      "gate_1482",
      {
        "type": "level",
        "pos": {
          "x": 240,
          "y": 100
        },
        "rotation": 0,
        "inputPins": [
          "pin_1483"
        ],
        "outputPins": [
          "pin_1484"
        ],
        "label": "OR",
        "status": "solved",
        "canRemove": false,
        "canMove": true
      }
    ],
    [
      "gate_1485",
      {
        "type": "level",
        "pos": {
          "x": 240,
          "y": 180
        },
        "rotation": 0,
        "inputPins": [
          "pin_1486"
        ],
        "outputPins": [
          "pin_1487"
        ],
        "label": "Always On",
        "status": "solved",
        "canRemove": false,
        "canMove": true
      }
    ],
    [
      "gate_1488",
      {
        "type": "level",
        "pos": {
          "x": 480,
          "y": 180
        },
        "rotation": 0,
        "inputPins": [
          "pin_1489"
        ],
        "outputPins": [
          "pin_1490"
        ],
        "label": "NOR",
        "status": "solved",
        "canRemove": false,
        "canMove": true
      }
    ],
    [
      "gate_1491",
      {
        "type": "level",
        "pos": {
          "x": 480,
          "y": -380
        },
        "rotation": 0,
        "inputPins": [
          "pin_1492"
        ],
        "outputPins": [
          "pin_1493"
        ],
        "label": "XOR",
        "status": "solved",
        "canRemove": false,
        "canMove": true
      }
    ],
    [
      "gate_1494",
      {
        "type": "level",
        "pos": {
          "x": 640,
          "y": -380
        },
        "rotation": 0,
        "inputPins": [
          "pin_1495"
        ],
        "outputPins": [
          "pin_1496"
        ],
        "label": "XNOR",
        "status": "solved",
        "canRemove": false,
        "canMove": true
      }
    ],
    [
      "gate_1497",
      {
        "type": "level",
        "pos": {
          "x": 480,
          "y": 100
        },
        "rotation": 0,
        "inputPins": [
          "pin_1498"
        ],
        "outputPins": [
          "pin_1499"
        ],
        "label": "3-bit OR",
        "status": "available",
        "canRemove": false,
        "canMove": true
      }
    ],
    [
      "gate_1500",
      {
        "type": "level",
        "pos": {
          "x": 480,
          "y": 20
        },
        "rotation": 0,
        "inputPins": [
          "pin_1501"
        ],
        "outputPins": [
          "pin_1502"
        ],
        "label": "3-bit AND",
        "status": "available",
        "canRemove": false,
        "canMove": true
      }
    ],
    [
      "gate_1503",
      {
        "type": "level",
        "pos": {
          "x": 640,
          "y": 260
        },
        "rotation": 0,
        "inputPins": [
          "pin_1504"
        ],
        "outputPins": [
          "pin_1505"
        ],
        "label": "8-bit NOT",
        "status": "available",
        "canRemove": false,
        "canMove": true
      }
    ],
    [
      "gate_1506",
      {
        "type": "level",
        "pos": {
          "x": 640,
          "y": 100
        },
        "rotation": 0,
        "inputPins": [
          "pin_1507"
        ],
        "outputPins": [
          "pin_1508"
        ],
        "label": "8-bit OR",
        "status": "available",
        "canRemove": false,
        "canMove": true
      }
    ],
    [
      "gate_1509",
      {
        "type": "level",
        "pos": {
          "x": 640,
          "y": 180
        },
        "rotation": 0,
        "inputPins": [
          "pin_1510"
        ],
        "outputPins": [
          "pin_1511"
        ],
        "label": "8-bit NOR",
        "status": "available",
        "canRemove": false,
        "canMove": true
      }
    ],
    [
      "gate_1512",
      {
        "type": "level",
        "pos": {
          "x": 640,
          "y": -500
        },
        "rotation": 0,
        "inputPins": [
          "pin_1513"
        ],
        "outputPins": [
          "pin_1514"
        ],
        "label": "Half Adder",
        "status": "available",
        "canRemove": false,
        "canMove": true
      }
    ],
    [
      "gate_1515",
      {
        "type": "level",
        "pos": {
          "x": 780,
          "y": -500
        },
        "rotation": 0,
        "inputPins": [
          "pin_1516"
        ],
        "outputPins": [
          "pin_1517"
        ],
        "label": "Full Adder",
        "status": "locked",
        "canRemove": false,
        "canMove": true
      }
    ],
    [
      "gate_1518",
      {
        "type": "level",
        "pos": {
          "x": 640,
          "y": -260
        },
        "rotation": 0,
        "inputPins": [
          "pin_1519"
        ],
        "outputPins": [
          "pin_1520"
        ],
        "label": "Switch",
        "status": "available",
        "canRemove": false,
        "canMove": true
      }
    ],
    [
      "gate_1521",
      {
        "type": "level",
        "pos": {
          "x": 480,
          "y": -160
        },
        "rotation": 0,
        "inputPins": [
          "pin_1522"
        ],
        "outputPins": [
          "pin_1523"
        ],
        "label": "1-bit \nDecoder",
        "status": "locked",
        "canRemove": false,
        "canMove": true
      }
    ],
    [
      "gate_1524",
      {
        "type": "level",
        "pos": {
          "x": 640,
          "y": -160
        },
        "rotation": 0,
        "inputPins": [
          "pin_1525"
        ],
        "outputPins": [
          "pin_1526"
        ],
        "label": "3-bit Decoder",
        "status": "locked",
        "canRemove": false,
        "canMove": true
      }
    ],
    [
      "gate_1527",
      {
        "type": "level",
        "pos": {
          "x": 780,
          "y": 260
        },
        "rotation": 0,
        "inputPins": [
          "pin_1528"
        ],
        "outputPins": [
          "pin_1529"
        ],
        "label": "8-bit Negate",
        "status": "locked",
        "canRemove": false,
        "canMove": true
      }
    ],
    [
      "gate_1530",
      {
        "type": "level",
        "pos": {
          "x": 480,
          "y": -600
        },
        "rotation": 0,
        "inputPins": [
          "pin_1531"
        ],
        "outputPins": [
          "pin_1532"
        ],
        "label": "Delay",
        "status": "available",
        "canRemove": false,
        "canMove": true
      }
    ],
    [
      "gate_1533",
      {
        "type": "level",
        "pos": {
          "x": 640,
          "y": -600
        },
        "rotation": 0,
        "inputPins": [
          "pin_1534"
        ],
        "outputPins": [
          "pin_1535"
        ],
        "label": "RS Latch",
        "status": "locked",
        "canRemove": false,
        "canMove": true
      }
    ],
    [
      "gate_1536",
      {
        "type": "level",
        "pos": {
          "x": 780,
          "y": -600
        },
        "rotation": 0,
        "inputPins": [
          "pin_1537"
        ],
        "outputPins": [
          "pin_1538"
        ],
        "label": "8-bit Memory",
        "status": "locked",
        "canRemove": false,
        "canMove": true
      }
    ],
    [
      "gate_1539",
      {
        "type": "level",
        "pos": {
          "x": 1020,
          "y": -760
        },
        "rotation": 0,
        "inputPins": [
          "pin_1540"
        ],
        "outputPins": [
          "pin_1541"
        ],
        "label": "8-bit Counter",
        "status": "locked",
        "canRemove": false,
        "canMove": true
      }
    ],
    [
      "gate_1542",
      {
        "type": "level",
        "pos": {
          "x": 1160,
          "y": -760
        },
        "rotation": 0,
        "inputPins": [
          "pin_1543"
        ],
        "outputPins": [
          "pin_1544"
        ],
        "label": "8-bit Counter + Reset",
        "status": "locked",
        "canRemove": false,
        "canMove": true
      }
    ],
    [
      "gate_1649",
      {
        "type": "and",
        "pos": {
          "x": 330,
          "y": -90
        },
        "rotation": 270,
        "inputPins": [
          "pin_1650",
          "pin_1651"
        ],
        "outputPins": [
          "pin_1652"
        ]
      }
    ],
    [
      "gate_1739",
      {
        "type": "tristate",
        "pos": {
          "x": 480,
          "y": -260
        },
        "rotation": 0,
        "inputPins": [
          "pin_1740",
          "pin_1741"
        ],
        "outputPins": [
          "pin_1742"
        ]
      }
    ],
    [
      "gate_1784",
      {
        "type": "and",
        "pos": {
          "x": 910,
          "y": -730
        },
        "rotation": 270,
        "inputPins": [
          "pin_1785",
          "pin_1786"
        ],
        "outputPins": [
          "pin_1787"
        ]
      }
    ]
  ],
  "pins": [
    [
      "pin_1477",
      {
        "gateId": "gate_1476",
        "kind": "input",
        "index": 0,
        "bitWidth": 1
      }
    ],
    [
      "pin_1478",
      {
        "gateId": "gate_1476",
        "kind": "output",
        "index": 0,
        "bitWidth": 1
      }
    ],
    [
      "pin_1480",
      {
        "gateId": "gate_1479",
        "kind": "input",
        "index": 0,
        "bitWidth": 1
      }
    ],
    [
      "pin_1481",
      {
        "gateId": "gate_1479",
        "kind": "output",
        "index": 0,
        "bitWidth": 1
      }
    ],
    [
      "pin_1483",
      {
        "gateId": "gate_1482",
        "kind": "input",
        "index": 0,
        "bitWidth": 1
      }
    ],
    [
      "pin_1484",
      {
        "gateId": "gate_1482",
        "kind": "output",
        "index": 0,
        "bitWidth": 1
      }
    ],
    [
      "pin_1486",
      {
        "gateId": "gate_1485",
        "kind": "input",
        "index": 0,
        "bitWidth": 1
      }
    ],
    [
      "pin_1487",
      {
        "gateId": "gate_1485",
        "kind": "output",
        "index": 0,
        "bitWidth": 1
      }
    ],
    [
      "pin_1489",
      {
        "gateId": "gate_1488",
        "kind": "input",
        "index": 0,
        "bitWidth": 1
      }
    ],
    [
      "pin_1490",
      {
        "gateId": "gate_1488",
        "kind": "output",
        "index": 0,
        "bitWidth": 1
      }
    ],
    [
      "pin_1492",
      {
        "gateId": "gate_1491",
        "kind": "input",
        "index": 0,
        "bitWidth": 1
      }
    ],
    [
      "pin_1493",
      {
        "gateId": "gate_1491",
        "kind": "output",
        "index": 0,
        "bitWidth": 1
      }
    ],
    [
      "pin_1495",
      {
        "gateId": "gate_1494",
        "kind": "input",
        "index": 0,
        "bitWidth": 1
      }
    ],
    [
      "pin_1496",
      {
        "gateId": "gate_1494",
        "kind": "output",
        "index": 0,
        "bitWidth": 1
      }
    ],
    [
      "pin_1498",
      {
        "gateId": "gate_1497",
        "kind": "input",
        "index": 0,
        "bitWidth": 1
      }
    ],
    [
      "pin_1499",
      {
        "gateId": "gate_1497",
        "kind": "output",
        "index": 0,
        "bitWidth": 1
      }
    ],
    [
      "pin_1501",
      {
        "gateId": "gate_1500",
        "kind": "input",
        "index": 0,
        "bitWidth": 1
      }
    ],
    [
      "pin_1502",
      {
        "gateId": "gate_1500",
        "kind": "output",
        "index": 0,
        "bitWidth": 1
      }
    ],
    [
      "pin_1504",
      {
        "gateId": "gate_1503",
        "kind": "input",
        "index": 0,
        "bitWidth": 1
      }
    ],
    [
      "pin_1505",
      {
        "gateId": "gate_1503",
        "kind": "output",
        "index": 0,
        "bitWidth": 1
      }
    ],
    [
      "pin_1507",
      {
        "gateId": "gate_1506",
        "kind": "input",
        "index": 0,
        "bitWidth": 1
      }
    ],
    [
      "pin_1508",
      {
        "gateId": "gate_1506",
        "kind": "output",
        "index": 0,
        "bitWidth": 1
      }
    ],
    [
      "pin_1510",
      {
        "gateId": "gate_1509",
        "kind": "input",
        "index": 0,
        "bitWidth": 1
      }
    ],
    [
      "pin_1511",
      {
        "gateId": "gate_1509",
        "kind": "output",
        "index": 0,
        "bitWidth": 1
      }
    ],
    [
      "pin_1513",
      {
        "gateId": "gate_1512",
        "kind": "input",
        "index": 0,
        "bitWidth": 1
      }
    ],
    [
      "pin_1514",
      {
        "gateId": "gate_1512",
        "kind": "output",
        "index": 0,
        "bitWidth": 1
      }
    ],
    [
      "pin_1516",
      {
        "gateId": "gate_1515",
        "kind": "input",
        "index": 0,
        "bitWidth": 1
      }
    ],
    [
      "pin_1517",
      {
        "gateId": "gate_1515",
        "kind": "output",
        "index": 0,
        "bitWidth": 1
      }
    ],
    [
      "pin_1519",
      {
        "gateId": "gate_1518",
        "kind": "input",
        "index": 0,
        "bitWidth": 1
      }
    ],
    [
      "pin_1520",
      {
        "gateId": "gate_1518",
        "kind": "output",
        "index": 0,
        "bitWidth": 1
      }
    ],
    [
      "pin_1522",
      {
        "gateId": "gate_1521",
        "kind": "input",
        "index": 0,
        "bitWidth": 1
      }
    ],
    [
      "pin_1523",
      {
        "gateId": "gate_1521",
        "kind": "output",
        "index": 0,
        "bitWidth": 1
      }
    ],
    [
      "pin_1525",
      {
        "gateId": "gate_1524",
        "kind": "input",
        "index": 0,
        "bitWidth": 1
      }
    ],
    [
      "pin_1526",
      {
        "gateId": "gate_1524",
        "kind": "output",
        "index": 0,
        "bitWidth": 1
      }
    ],
    [
      "pin_1528",
      {
        "gateId": "gate_1527",
        "kind": "input",
        "index": 0,
        "bitWidth": 1
      }
    ],
    [
      "pin_1529",
      {
        "gateId": "gate_1527",
        "kind": "output",
        "index": 0,
        "bitWidth": 1
      }
    ],
    [
      "pin_1531",
      {
        "gateId": "gate_1530",
        "kind": "input",
        "index": 0,
        "bitWidth": 1
      }
    ],
    [
      "pin_1532",
      {
        "gateId": "gate_1530",
        "kind": "output",
        "index": 0,
        "bitWidth": 1
      }
    ],
    [
      "pin_1534",
      {
        "gateId": "gate_1533",
        "kind": "input",
        "index": 0,
        "bitWidth": 1
      }
    ],
    [
      "pin_1535",
      {
        "gateId": "gate_1533",
        "kind": "output",
        "index": 0,
        "bitWidth": 1
      }
    ],
    [
      "pin_1537",
      {
        "gateId": "gate_1536",
        "kind": "input",
        "index": 0,
        "bitWidth": 1
      }
    ],
    [
      "pin_1538",
      {
        "gateId": "gate_1536",
        "kind": "output",
        "index": 0,
        "bitWidth": 1
      }
    ],
    [
      "pin_1540",
      {
        "gateId": "gate_1539",
        "kind": "input",
        "index": 0,
        "bitWidth": 1
      }
    ],
    [
      "pin_1541",
      {
        "gateId": "gate_1539",
        "kind": "output",
        "index": 0,
        "bitWidth": 1
      }
    ],
    [
      "pin_1543",
      {
        "gateId": "gate_1542",
        "kind": "input",
        "index": 0,
        "bitWidth": 1
      }
    ],
    [
      "pin_1544",
      {
        "gateId": "gate_1542",
        "kind": "output",
        "index": 0,
        "bitWidth": 1
      }
    ],
    [
      "pin_1650",
      {
        "gateId": "gate_1649",
        "kind": "input",
        "index": 0,
        "bitWidth": 1
      }
    ],
    [
      "pin_1651",
      {
        "gateId": "gate_1649",
        "kind": "input",
        "index": 1,
        "bitWidth": 1
      }
    ],
    [
      "pin_1652",
      {
        "gateId": "gate_1649",
        "kind": "output",
        "index": 0,
        "bitWidth": 1
      }
    ],
    [
      "pin_1740",
      {
        "gateId": "gate_1739",
        "kind": "input",
        "index": 0,
        "bitWidth": 1
      }
    ],
    [
      "pin_1741",
      {
        "gateId": "gate_1739",
        "kind": "input",
        "index": 1,
        "bitWidth": 1
      }
    ],
    [
      "pin_1742",
      {
        "gateId": "gate_1739",
        "kind": "output",
        "index": 0,
        "bitWidth": 1
      }
    ],
    [
      "pin_1785",
      {
        "gateId": "gate_1784",
        "kind": "input",
        "index": 0,
        "bitWidth": 1
      }
    ],
    [
      "pin_1786",
      {
        "gateId": "gate_1784",
        "kind": "input",
        "index": 1,
        "bitWidth": 1
      }
    ],
    [
      "pin_1787",
      {
        "gateId": "gate_1784",
        "kind": "output",
        "index": 0,
        "bitWidth": 1
      }
    ]
  ],
  "wireNodes": [
    [
      "wn_1545",
      {
        "pos": {
          "x": 160,
          "y": 120
        },
        "pinId": "pin_1478"
      }
    ],
    [
      "wn_1546",
      {
        "pos": {
          "x": 240,
          "y": 80
        }
      }
    ],
    [
      "wn_1548",
      {
        "pos": {
          "x": 240,
          "y": 160
        }
      }
    ],
    [
      "wn_1550",
      {
        "pos": {
          "x": 460,
          "y": 240
        }
      }
    ],
    [
      "wn_1552",
      {
        "pos": {
          "x": 320,
          "y": 160
        }
      }
    ],
    [
      "wn_1553",
      {
        "pos": {
          "x": 460,
          "y": 160
        }
      }
    ],
    [
      "wn_1556",
      {
        "pos": {
          "x": 320,
          "y": 80
        }
      }
    ],
    [
      "wn_1557",
      {
        "pos": {
          "x": 460,
          "y": 80
        }
      }
    ],
    [
      "wn_1560",
      {
        "pos": {
          "x": 540,
          "y": 80
        }
      }
    ],
    [
      "wn_1561",
      {
        "pos": {
          "x": 640,
          "y": -360
        },
        "pinId": "pin_1495"
      }
    ],
    [
      "wn_1572",
      {
        "pos": {
          "x": 540,
          "y": 160
        }
      }
    ],
    [
      "wn_1579",
      {
        "pos": {
          "x": 960,
          "y": 80
        }
      }
    ],
    [
      "wn_1580",
      {
        "pos": {
          "x": 1040,
          "y": 80
        }
      }
    ],
    [
      "wn_1582",
      {
        "pos": {
          "x": 560,
          "y": 120
        },
        "pinId": "pin_1499"
      }
    ],
    [
      "wn_1588",
      {
        "pos": {
          "x": 960,
          "y": 160
        }
      }
    ],
    [
      "wn_1589",
      {
        "pos": {
          "x": 1040,
          "y": 160
        }
      }
    ],
    [
      "wn_1596",
      {
        "pos": {
          "x": 540,
          "y": 240
        }
      }
    ],
    [
      "wn_1600",
      {
        "pos": {
          "x": 960,
          "y": 240
        }
      }
    ],
    [
      "wn_1601",
      {
        "pos": {
          "x": 1040,
          "y": 240
        }
      }
    ],
    [
      "wn_1604",
      {
        "pos": {
          "x": 1120,
          "y": 240
        }
      }
    ],
    [
      "wn_1605",
      {
        "pos": {
          "x": 1200,
          "y": 240
        }
      }
    ],
    [
      "wn_1609",
      {
        "pos": {
          "x": 1280,
          "y": 240
        }
      }
    ],
    [
      "wn_1610",
      {
        "pos": {
          "x": 1020,
          "y": -740
        },
        "pinId": "pin_1540"
      }
    ],
    [
      "wn_1614",
      {
        "pos": {
          "x": 1100,
          "y": -740
        },
        "pinId": "pin_1541"
      }
    ],
    [
      "wn_1615",
      {
        "pos": {
          "x": 1160,
          "y": -740
        },
        "pinId": "pin_1543"
      }
    ],
    [
      "wn_1622",
      {
        "pos": {
          "x": 240,
          "y": 120
        },
        "pinId": "pin_1483"
      }
    ],
    [
      "wn_1627",
      {
        "pos": {
          "x": 200,
          "y": 120
        }
      }
    ],
    [
      "wn_1630",
      {
        "pos": {
          "x": 200,
          "y": 40
        }
      }
    ],
    [
      "wn_1632",
      {
        "pos": {
          "x": 240,
          "y": 40
        },
        "pinId": "pin_1480"
      }
    ],
    [
      "wn_1634",
      {
        "pos": {
          "x": 320,
          "y": 120
        },
        "pinId": "pin_1484"
      }
    ],
    [
      "wn_1637",
      {
        "pos": {
          "x": 200,
          "y": 200
        }
      }
    ],
    [
      "wn_1639",
      {
        "pos": {
          "x": 240,
          "y": 200
        },
        "pinId": "pin_1486"
      }
    ],
    [
      "wn_1641",
      {
        "pos": {
          "x": 480,
          "y": 200
        },
        "pinId": "pin_1489"
      }
    ],
    [
      "wn_1644",
      {
        "pos": {
          "x": 340,
          "y": 40
        }
      }
    ],
    [
      "wn_1645",
      {
        "pos": {
          "x": 320,
          "y": 40
        },
        "pinId": "pin_1481"
      }
    ],
    [
      "wn_1647",
      {
        "pos": {
          "x": 340,
          "y": -40
        },
        "pinId": "pin_1650"
      }
    ],
    [
      "wn_1658",
      {
        "pos": {
          "x": 380,
          "y": 120
        }
      }
    ],
    [
      "wn_1663",
      {
        "pos": {
          "x": 480,
          "y": -360
        },
        "pinId": "pin_1492"
      }
    ],
    [
      "wn_1665",
      {
        "pos": {
          "x": 560,
          "y": -360
        },
        "pinId": "pin_1493"
      }
    ],
    [
      "wn_1670",
      {
        "pos": {
          "x": 480,
          "y": 40
        },
        "pinId": "pin_1501"
      }
    ],
    [
      "wn_1672",
      {
        "pos": {
          "x": 480,
          "y": 120
        },
        "pinId": "pin_1498"
      }
    ],
    [
      "wn_1676",
      {
        "pos": {
          "x": 560,
          "y": 200
        },
        "pinId": "pin_1490"
      }
    ],
    [
      "wn_1677",
      {
        "pos": {
          "x": 640,
          "y": 200
        },
        "pinId": "pin_1510"
      }
    ],
    [
      "wn_1679",
      {
        "pos": {
          "x": 560,
          "y": 120
        },
        "pinId": "pin_1499"
      }
    ],
    [
      "wn_1680",
      {
        "pos": {
          "x": 640,
          "y": 120
        },
        "pinId": "pin_1507"
      }
    ],
    [
      "wn_1682",
      {
        "pos": {
          "x": 200,
          "y": 280
        }
      }
    ],
    [
      "wn_1684",
      {
        "pos": {
          "x": 640,
          "y": 280
        },
        "pinId": "pin_1504"
      }
    ],
    [
      "wn_1689",
      {
        "pos": {
          "x": 380,
          "y": 200
        }
      }
    ],
    [
      "wn_1692",
      {
        "pos": {
          "x": 720,
          "y": 280
        },
        "pinId": "pin_1505"
      }
    ],
    [
      "wn_1693",
      {
        "pos": {
          "x": 780,
          "y": 280
        },
        "pinId": "pin_1528"
      }
    ],
    [
      "wn_1698",
      {
        "pos": {
          "x": 600,
          "y": -360
        }
      }
    ],
    [
      "wn_1701",
      {
        "pos": {
          "x": 600,
          "y": -480
        }
      }
    ],
    [
      "wn_1703",
      {
        "pos": {
          "x": 640,
          "y": -480
        },
        "pinId": "pin_1513"
      }
    ],
    [
      "wn_1705",
      {
        "pos": {
          "x": 720,
          "y": -480
        },
        "pinId": "pin_1514"
      }
    ],
    [
      "wn_1708",
      {
        "pos": {
          "x": 780,
          "y": -480
        },
        "pinId": "pin_1516"
      }
    ],
    [
      "wn_1712",
      {
        "pos": {
          "x": 380,
          "y": -40
        },
        "pinId": "pin_1651"
      }
    ],
    [
      "wn_1714",
      {
        "pos": {
          "x": 360,
          "y": -100
        },
        "pinId": "pin_1652"
      }
    ],
    [
      "wn_1720",
      {
        "pos": {
          "x": 360,
          "y": -140
        }
      }
    ],
    [
      "wn_1726",
      {
        "pos": {
          "x": 360,
          "y": -140
        }
      }
    ],
    [
      "wn_1728",
      {
        "pos": {
          "x": 480,
          "y": -140
        },
        "pinId": "pin_1522"
      }
    ],
    [
      "wn_1730",
      {
        "pos": {
          "x": 560,
          "y": -140
        },
        "pinId": "pin_1523"
      }
    ],
    [
      "wn_1731",
      {
        "pos": {
          "x": 640,
          "y": -140
        },
        "pinId": "pin_1525"
      }
    ],
    [
      "wn_1736",
      {
        "pos": {
          "x": 360,
          "y": -360
        }
      }
    ],
    [
      "wn_1746",
      {
        "pos": {
          "x": 360,
          "y": -240
        }
      }
    ],
    [
      "wn_1749",
      {
        "pos": {
          "x": 480,
          "y": -240
        },
        "pinId": "pin_1740"
      }
    ],
    [
      "wn_1751",
      {
        "pos": {
          "x": 640,
          "y": -240
        },
        "pinId": "pin_1519"
      }
    ],
    [
      "wn_1752",
      {
        "pos": {
          "x": 520,
          "y": -240
        },
        "pinId": "pin_1742"
      }
    ],
    [
      "wn_1754",
      {
        "pos": {
          "x": 360,
          "y": -580
        }
      }
    ],
    [
      "wn_1756",
      {
        "pos": {
          "x": 480,
          "y": -580
        },
        "pinId": "pin_1531"
      }
    ],
    [
      "wn_1761",
      {
        "pos": {
          "x": 460,
          "y": -240
        }
      }
    ],
    [
      "wn_1764",
      {
        "pos": {
          "x": 460,
          "y": -260
        }
      }
    ],
    [
      "wn_1766",
      {
        "pos": {
          "x": 500,
          "y": -260
        },
        "pinId": "pin_1741"
      }
    ],
    [
      "wn_1768",
      {
        "pos": {
          "x": 560,
          "y": -580
        },
        "pinId": "pin_1532"
      }
    ],
    [
      "wn_1769",
      {
        "pos": {
          "x": 640,
          "y": -580
        },
        "pinId": "pin_1534"
      }
    ],
    [
      "wn_1771",
      {
        "pos": {
          "x": 720,
          "y": -580
        },
        "pinId": "pin_1535"
      }
    ],
    [
      "wn_1772",
      {
        "pos": {
          "x": 780,
          "y": -580
        },
        "pinId": "pin_1537"
      }
    ],
    [
      "wn_1774",
      {
        "pos": {
          "x": 960,
          "y": -480
        }
      }
    ],
    [
      "wn_1775",
      {
        "pos": {
          "x": 860,
          "y": -480
        },
        "pinId": "pin_1517"
      }
    ],
    [
      "wn_1777",
      {
        "pos": {
          "x": 920,
          "y": -580
        }
      }
    ],
    [
      "wn_1778",
      {
        "pos": {
          "x": 860,
          "y": -580
        },
        "pinId": "pin_1538"
      }
    ],
    [
      "wn_1780",
      {
        "pos": {
          "x": 960,
          "y": -680
        },
        "pinId": "pin_1786"
      }
    ],
    [
      "wn_1782",
      {
        "pos": {
          "x": 920,
          "y": -680
        },
        "pinId": "pin_1785"
      }
    ],
    [
      "wn_1788",
      {
        "pos": {
          "x": 920,
          "y": -680
        },
        "pinId": "pin_1785"
      }
    ],
    [
      "wn_1789",
      {
        "pos": {
          "x": 960,
          "y": -680
        },
        "pinId": "pin_1786"
      }
    ],
    [
      "wn_1790",
      {
        "pos": {
          "x": 940,
          "y": -740
        },
        "pinId": "pin_1787"
      }
    ]
  ],
  "wireSegments": [
    [
      "ws_1628",
      {
        "from": "wn_1545",
        "to": "wn_1627"
      }
    ],
    [
      "ws_1629",
      {
        "from": "wn_1627",
        "to": "wn_1622"
      }
    ],
    [
      "ws_1631",
      {
        "from": "wn_1627",
        "to": "wn_1630"
      }
    ],
    [
      "ws_1633",
      {
        "from": "wn_1630",
        "to": "wn_1632"
      }
    ],
    [
      "ws_1638",
      {
        "from": "wn_1627",
        "to": "wn_1637"
      }
    ],
    [
      "ws_1640",
      {
        "from": "wn_1637",
        "to": "wn_1639"
      }
    ],
    [
      "ws_1646",
      {
        "from": "wn_1645",
        "to": "wn_1644"
      }
    ],
    [
      "ws_1648",
      {
        "from": "wn_1644",
        "to": "wn_1647"
      }
    ],
    [
      "ws_1659",
      {
        "from": "wn_1634",
        "to": "wn_1658"
      }
    ],
    [
      "ws_1671",
      {
        "from": "wn_1644",
        "to": "wn_1670"
      }
    ],
    [
      "ws_1678",
      {
        "from": "wn_1676",
        "to": "wn_1677"
      }
    ],
    [
      "ws_1681",
      {
        "from": "wn_1679",
        "to": "wn_1680"
      }
    ],
    [
      "ws_1683",
      {
        "from": "wn_1637",
        "to": "wn_1682"
      }
    ],
    [
      "ws_1685",
      {
        "from": "wn_1682",
        "to": "wn_1684"
      }
    ],
    [
      "ws_1690",
      {
        "from": "wn_1658",
        "to": "wn_1689"
      }
    ],
    [
      "ws_1691",
      {
        "from": "wn_1689",
        "to": "wn_1641"
      }
    ],
    [
      "ws_1694",
      {
        "from": "wn_1692",
        "to": "wn_1693"
      }
    ],
    [
      "ws_1699",
      {
        "from": "wn_1665",
        "to": "wn_1698"
      }
    ],
    [
      "ws_1700",
      {
        "from": "wn_1698",
        "to": "wn_1561"
      }
    ],
    [
      "ws_1702",
      {
        "from": "wn_1698",
        "to": "wn_1701"
      }
    ],
    [
      "ws_1704",
      {
        "from": "wn_1701",
        "to": "wn_1703"
      }
    ],
    [
      "ws_1710",
      {
        "from": "wn_1705",
        "to": "wn_1708"
      }
    ],
    [
      "ws_1711",
      {
        "from": "wn_1658",
        "to": "wn_1672"
      }
    ],
    [
      "ws_1713",
      {
        "from": "wn_1658",
        "to": "wn_1712"
      }
    ],
    [
      "ws_1722",
      {
        "from": "wn_1720",
        "to": "wn_1714"
      }
    ],
    [
      "ws_1727",
      {
        "from": "wn_1720",
        "to": "wn_1726"
      }
    ],
    [
      "ws_1729",
      {
        "from": "wn_1726",
        "to": "wn_1728"
      }
    ],
    [
      "ws_1732",
      {
        "from": "wn_1730",
        "to": "wn_1731"
      }
    ],
    [
      "ws_1737",
      {
        "from": "wn_1663",
        "to": "wn_1736"
      }
    ],
    [
      "ws_1747",
      {
        "from": "wn_1736",
        "to": "wn_1746"
      }
    ],
    [
      "ws_1748",
      {
        "from": "wn_1746",
        "to": "wn_1720"
      }
    ],
    [
      "ws_1753",
      {
        "from": "wn_1752",
        "to": "wn_1751"
      }
    ],
    [
      "ws_1755",
      {
        "from": "wn_1736",
        "to": "wn_1754"
      }
    ],
    [
      "ws_1757",
      {
        "from": "wn_1754",
        "to": "wn_1756"
      }
    ],
    [
      "ws_1762",
      {
        "from": "wn_1746",
        "to": "wn_1761"
      }
    ],
    [
      "ws_1763",
      {
        "from": "wn_1761",
        "to": "wn_1749"
      }
    ],
    [
      "ws_1765",
      {
        "from": "wn_1761",
        "to": "wn_1764"
      }
    ],
    [
      "ws_1767",
      {
        "from": "wn_1764",
        "to": "wn_1766"
      }
    ],
    [
      "ws_1770",
      {
        "from": "wn_1768",
        "to": "wn_1769"
      }
    ],
    [
      "ws_1773",
      {
        "from": "wn_1771",
        "to": "wn_1772"
      }
    ],
    [
      "ws_1776",
      {
        "from": "wn_1775",
        "to": "wn_1774"
      }
    ],
    [
      "ws_1779",
      {
        "from": "wn_1778",
        "to": "wn_1777"
      }
    ],
    [
      "ws_1781",
      {
        "from": "wn_1774",
        "to": "wn_1780"
      }
    ],
    [
      "ws_1783",
      {
        "from": "wn_1777",
        "to": "wn_1782"
      }
    ],
    [
      "ws_1791",
      {
        "from": "wn_1790",
        "to": "wn_1610"
      }
    ],
    [
      "ws_1792",
      {
        "from": "wn_1614",
        "to": "wn_1615"
      }
    ]
  ]
}) as unknown as SerializedCircuit;
