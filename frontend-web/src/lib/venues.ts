// Catálogo completo de estadios y coordenadas de fútbol español (LaLiga EA Sports + Hypermotion)
export interface VenueInfo {
  id: string
  name: string
  shortName: string
  lat: number
  lon: number
}

// Mapa de sedes por ID de fixture (partido específico)
export const FIXTURE_VENUES: Record<string, VenueInfo> = {
  "3xcjz4isjg101zf0d40lxkglw": {
    "id": "d9i7k0es5x4ccxcapt1fcg9c2",
    "name": "Estadio de la Cerámica",
    "shortName": "Estadio de la Cerámica",
    "lat": 39.944119,
    "lon": -0.103474
  },
  "3y3gz2ufpcbu5vkgph7jyg74k": {
    "id": "3y2qrs9lma04q7tntobgey3s8",
    "name": "Estadi Municipal de Montilivi",
    "shortName": "Estadi Municipal de Montilivi",
    "lat": 41.961195,
    "lon": 2.828495
  },
  "3xq4alyjtlltd6j11gckoxvkk": {
    "id": "8ell9vv21ntqufsr5a4qyvjlg",
    "name": "Estadio de Mestalla",
    "shortName": "Estadio de Mestalla",
    "lat": 39.474602,
    "lon": -0.358257
  },
  "3wz71k4469ny273fw5c1yavx0": {
    "id": "7o6sbdki1c1b3f54ga3xj5abb",
    "name": "Estadio Bernabéu",
    "shortName": "Estadio Bernabéu",
    "lat": 40.453068,
    "lon": -3.688354
  },
  "3wljbdagmhpi6h7viwogz9ul0": {
    "id": "awbbogt2i6macegd87pre8044",
    "name": "Estadi Mallorca Son Moix",
    "shortName": "Estadi Mallorca Son Moix",
    "lat": 39.58994,
    "lon": 2.630078
  },
  "3w881304b6s154go90fihrjtg": {
    "id": "4ydszy39adhtczo02as8gdqup",
    "name": "Estadio Coliseum",
    "shortName": "Estadio Coliseum",
    "lat": 40.325729,
    "lon": -3.714964
  },
  "3vur4jhid3p73hq5qz0t48bv8": {
    "id": "46sq3vgaf79kjl0yd82jm3t5n",
    "name": "RCDE Stadium",
    "shortName": "RCDE Stadium",
    "lat": 41.34786,
    "lon": 2.075622
  },
  "3vhe91racce86uhq0b3mw29sk": {
    "id": "8z6nwwiy8h2kqq7z3yxf7aqti",
    "name": "Estadio Abanca-Balaídos",
    "shortName": "Estadio Abanca-Balaídos",
    "lat": 42.211852,
    "lon": -8.739721
  },
  "3v3zljn1yog1g4knq4uoaledw": {
    "id": "8igj49hbhu62z77bwtczd7zc5",
    "name": "Estadio La Cartuja de Sevilla",
    "shortName": "Estadio La Cartuja de Sevilla",
    "lat": 37.417209,
    "lon": -6.004661
  },
  "3up18t49bq8thej74h5lgf0us": {
    "id": "26ycul6lcermwam7oxr57qyny",
    "name": "Estadio de Mendizorroza",
    "shortName": "Estadio de Mendizorroza",
    "lat": 42.837076,
    "lon": -2.688247
  },
  "3rpa9gg887sphjnou8h1uv6s4": {
    "id": "8jpaixac05v4tl6wyhwk2drdy",
    "name": "Spotify Camp Nou",
    "shortName": "Spotify Camp Nou",
    "lat": 41.38089,
    "lon": 2.122813
  },
  "3ubq4xhedh6kqvsb2d7cvw650": {
    "id": "81guly6ecfrnsu6pfs0qqb1ik",
    "name": "Estadio Ramón Sánchez Pizjuán",
    "shortName": "Estadio Ramón Sánchez Pizjuán",
    "lat": 37.384046,
    "lon": -5.970592
  },
  "3ty1scc4fcein2b664ssgnwus": {
    "id": "23fwsofybpbwfcxjrysy6on19",
    "name": "Estadio El Sadar",
    "shortName": "Estadio El Sadar",
    "lat": 42.796677,
    "lon": -1.637141
  },
  "3tkk80csb0shs70l1ucy03uok": {
    "id": "1i6aurveqizhdsg4bgdhprlom",
    "name": "Estadio Municipal Carlos Tartiere",
    "shortName": "Estadio Municipal Carlos Tartiere",
    "lat": 43.360762,
    "lon": -5.870261
  },
  "3t723gzwnzh44w0jdk8bfjdhw": {
    "id": "bpfd0sk353ozrgi4jrjs5qgqs",
    "name": "Estadio Municipal de Anoeta",
    "shortName": "Estadio Municipal de Anoeta",
    "lat": 43.301376,
    "lon": -1.973602
  },
  "3stn5qtfq9b7w461hrsz1y0wk": {
    "id": "6wek5bab1al0qtnl6pjyntp42",
    "name": "Estadio de Vallecas",
    "shortName": "Estadio de Vallecas",
    "lat": 40.391823,
    "lon": -3.658589
  },
  "3sg7p1fgas9oyig0lv5gdmvis": {
    "id": "2n6pw21w4t9kc955w78ryjkyr",
    "name": "Estadio Ciudad de Valencia",
    "shortName": "Estadio Ciudad de Valencia",
    "lat": 39.494686,
    "lon": -0.36382
  },
  "3s2q5sph3bm3auk1b8odb493o": {
    "id": "4rog35zkswi1nymg8o55ppiag",
    "name": "Estadio Manuel Martínez Valero",
    "shortName": "Estadio Manuel Martínez Valero",
    "lat": 38.267129,
    "lon": -0.6633
  },
  "3rbvenobhbiyu2oz1067g87x0": {
    "id": "4dki5bxv1ttz1c9vkeifguc45",
    "name": "Riyadh Air Metropolitano",
    "shortName": "Riyadh Air Metropolitano",
    "lat": 40.436226,
    "lon": -3.59946
  },
  "3qyh2orw2524xs3k60h0cxxxw": {
    "id": "3tsyaiz1y1gg31xw81qgtrx4w",
    "name": "Estadio de San Mamés",
    "shortName": "Estadio de San Mamés",
    "lat": 43.264173,
    "lon": -2.949383
  },
  "3ql6gx72pau1cocng395b63h0": {
    "id": "7o6sbdki1c1b3f54ga3xj5abb",
    "name": "Estadio Bernabéu",
    "shortName": "Estadio Bernabéu",
    "lat": 40.453068,
    "lon": -3.688354
  },
  "3ooiol9lfrmnu1bfpa099xhxw": {
    "id": "3y2qrs9lma04q7tntobgey3s8",
    "name": "Estadi Municipal de Montilivi",
    "shortName": "Estadi Municipal de Montilivi",
    "lat": 41.961195,
    "lon": 2.828495
  },
  "3psr2605g4d19sdukq2711gd0": {
    "id": "8ell9vv21ntqufsr5a4qyvjlg",
    "name": "Estadio de Mestalla",
    "shortName": "Estadio de Mestalla",
    "lat": 39.474602,
    "lon": -0.358257
  },
  "3oazgnn4to0s2xa8mtme8o36c": {
    "id": "4ydszy39adhtczo02as8gdqup",
    "name": "Estadio Coliseum",
    "shortName": "Estadio Coliseum",
    "lat": 40.325729,
    "lon": -3.714964
  },
  "3n65mnr76iym0yv9wmk1ug6c4": {
    "id": "26ycul6lcermwam7oxr57qyny",
    "name": "Estadio de Mendizorroza",
    "shortName": "Estadio de Mendizorroza",
    "lat": 42.837076,
    "lon": -2.688247
  },
  "3q7xe5wdnb9goknf23kydt8no": {
    "id": "d9i7k0es5x4ccxcapt1fcg9c2",
    "name": "Estadio de la Cerámica",
    "shortName": "Estadio de la Cerámica",
    "lat": 39.944119,
    "lon": -0.103474
  },
  "3p1xhxrl565qq3x5swdj977dg": {
    "id": "46sq3vgaf79kjl0yd82jm3t5n",
    "name": "RCDE Stadium",
    "shortName": "RCDE Stadium",
    "lat": 41.34786,
    "lon": 2.075622
  },
  "3pfak8vavaxumsfvxz2yo48wk": {
    "id": "23fwsofybpbwfcxjrysy6on19",
    "name": "Estadio El Sadar",
    "shortName": "Estadio El Sadar",
    "lat": 42.796677,
    "lon": -1.637141
  },
  "3njoj8cm40koxt8u94a1h3yfo": {
    "id": "8igj49hbhu62z77bwtczd7zc5",
    "name": "Estadio La Cartuja de Sevilla",
    "shortName": "Estadio La Cartuja de Sevilla",
    "lat": 37.417209,
    "lon": -6.004661
  },
  "3nxmo9ajqnht9425i3n9szevo": {
    "id": "8z6nwwiy8h2kqq7z3yxf7aqti",
    "name": "Estadio Abanca-Balaídos",
    "shortName": "Estadio Abanca-Balaídos",
    "lat": 42.211852,
    "lon": -8.739721
  },
  "3je81f1r98u8rqsk99bzjwyl0": {
    "id": "6wek5bab1al0qtnl6pjyntp42",
    "name": "Estadio de Vallecas",
    "shortName": "Estadio de Vallecas",
    "lat": 40.391823,
    "lon": -3.658589
  },
  "3kigmlbqhunbi6gixcr7cz6z8": {
    "id": "8jpaixac05v4tl6wyhwk2drdy",
    "name": "Spotify Camp Nou",
    "shortName": "Spotify Camp Nou",
    "lat": 41.38089,
    "lon": 2.122813
  },
  "3msszbu4fc0okhk1cy6k7f09g": {
    "id": "1i6aurveqizhdsg4bgdhprlom",
    "name": "Estadio Municipal Carlos Tartiere",
    "shortName": "Estadio Municipal Carlos Tartiere",
    "lat": 43.360762,
    "lon": -5.870261
  },
  "3jromoqjf4ywqhz6gv1xpo0lw": {
    "id": "3tsyaiz1y1gg31xw81qgtrx4w",
    "name": "Estadio de San Mamés",
    "shortName": "Estadio de San Mamés",
    "lat": 43.264173,
    "lon": -2.949383
  },
  "3lazt464v4k6hjwcq9ljf0ums": {
    "id": "awbbogt2i6macegd87pre8044",
    "name": "Estadi Mallorca Son Moix",
    "shortName": "Estadi Mallorca Son Moix",
    "lat": 39.58994,
    "lon": 2.630078
  },
  "3m24sjc20wo15f6mmkw3qeqz8": {
    "id": "bpfd0sk353ozrgi4jrjs5qgqs",
    "name": "Estadio Municipal de Anoeta",
    "shortName": "Estadio Municipal de Anoeta",
    "lat": 43.301376,
    "lon": -1.973602
  },
  "3k57p4cr98z0cknr4b39kaivo": {
    "id": "4dki5bxv1ttz1c9vkeifguc45",
    "name": "Riyadh Air Metropolitano",
    "shortName": "Riyadh Air Metropolitano",
    "lat": 40.436226,
    "lon": -3.59946
  },
  "3mfg133s0kwtlbnaes34dxhxw": {
    "id": "81guly6ecfrnsu6pfs0qqb1ik",
    "name": "Estadio Ramón Sánchez Pizjuán",
    "shortName": "Estadio Ramón Sánchez Pizjuán",
    "lat": 37.384046,
    "lon": -5.970592
  },
  "3logguenlwy065aa7gb1hf3tg": {
    "id": "4rog35zkswi1nymg8o55ppiag",
    "name": "Estadio Manuel Martínez Valero",
    "shortName": "Estadio Manuel Martínez Valero",
    "lat": 38.267129,
    "lon": -0.6633
  },
  "3kvn4dplqj7ecztktcd1afhuc": {
    "id": "2n6pw21w4t9kc955w78ryjkyr",
    "name": "Estadio Ciudad de Valencia",
    "shortName": "Estadio Ciudad de Valencia",
    "lat": 39.494686,
    "lon": -0.36382
  },
  "3fzj97pollbznset694q593bo": {
    "id": "81guly6ecfrnsu6pfs0qqb1ik",
    "name": "Estadio Ramón Sánchez Pizjuán",
    "shortName": "Estadio Ramón Sánchez Pizjuán",
    "lat": 37.384046,
    "lon": -5.970592
  },
  "3hj39lcguw2pwxyqlq86jqntg": {
    "id": "46sq3vgaf79kjl0yd82jm3t5n",
    "name": "RCDE Stadium",
    "shortName": "RCDE Stadium",
    "lat": 41.34786,
    "lon": 2.075622
  },
  "3gs6lllokoo9wk19co9k4yyac": {
    "id": "8igj49hbhu62z77bwtczd7zc5",
    "name": "Estadio La Cartuja de Sevilla",
    "shortName": "Estadio La Cartuja de Sevilla",
    "lat": 37.417209,
    "lon": -6.004661
  },
  "3hwithiznhjl7ecaoxv7hemfo": {
    "id": "4ydszy39adhtczo02as8gdqup",
    "name": "Estadio Coliseum",
    "shortName": "Estadio Coliseum",
    "lat": 40.325729,
    "lon": -3.714964
  },
  "3h5n4m7klbnl9dx9yx9w5zk7o": {
    "id": "8z6nwwiy8h2kqq7z3yxf7aqti",
    "name": "Estadio Abanca-Balaídos",
    "shortName": "Estadio Abanca-Balaídos",
    "lat": 42.211852,
    "lon": -8.739721
  },
  "3j0vwkubszbtkr21f7upb4il0": {
    "id": "23fwsofybpbwfcxjrysy6on19",
    "name": "Estadio El Sadar",
    "shortName": "Estadio El Sadar",
    "lat": 42.796677,
    "lon": -1.637141
  },
  "3getgrlqh307l5da5tutqt3pw": {
    "id": "26ycul6lcermwam7oxr57qyny",
    "name": "Estadio de Mendizorroza",
    "shortName": "Estadio de Mendizorroza",
    "lat": 42.837076,
    "lon": -2.688247
  },
  "3indehxonm3sorl5dn4ojvj84": {
    "id": "8ell9vv21ntqufsr5a4qyvjlg",
    "name": "Estadio de Mestalla",
    "shortName": "Estadio de Mestalla",
    "lat": 39.474602,
    "lon": -0.358257
  },
  "3fm6zt7nl7hs2oolj5ksug3ys": {
    "id": "d9i7k0es5x4ccxcapt1fcg9c2",
    "name": "Estadio de la Cerámica",
    "shortName": "Estadio de la Cerámica",
    "lat": 39.944119,
    "lon": -0.103474
  },
  "3i9z3nd0s3lxkt3l5hpy8wil0": {
    "id": "3y2qrs9lma04q7tntobgey3s8",
    "name": "Estadi Municipal de Montilivi",
    "shortName": "Estadi Municipal de Montilivi",
    "lat": 41.961195,
    "lon": 2.828495
  },
  "394u1x6d00xy857x0kzh48oic": {
    "id": "46sq3vgaf79kjl0yd82jm3t5n",
    "name": "RCDE Stadium",
    "shortName": "RCDE Stadium",
    "lat": 41.34786,
    "lon": 2.075622
  },
  "3b3hklhztdbiyiwxo9qwh80lw": {
    "id": "d9i7k0es5x4ccxcapt1fcg9c2",
    "name": "Estadio de la Cerámica",
    "shortName": "Estadio de la Cerámica",
    "lat": 39.944119,
    "lon": -0.103474
  },
  "39ifvpi5wnexvu36qh4irjbx0": {
    "id": "23fwsofybpbwfcxjrysy6on19",
    "name": "Estadio El Sadar",
    "shortName": "Estadio El Sadar",
    "lat": 42.796677,
    "lon": -1.637141
  },
  "3bihehy0y8mtxizg74rkkuh3o": {
    "id": "1i6aurveqizhdsg4bgdhprlom",
    "name": "Estadio Municipal Carlos Tartiere",
    "shortName": "Estadio Municipal Carlos Tartiere",
    "lat": 43.360762,
    "lon": -5.870261
  },
  "39yze5lq7b1227m0ry1qpjfh0": {
    "id": "6wek5bab1al0qtnl6pjyntp42",
    "name": "Estadio de Vallecas",
    "shortName": "Estadio de Vallecas",
    "lat": 40.391823,
    "lon": -3.658589
  },
  "3achbi56yevn41ahu7amhx638": {
    "id": "4dki5bxv1ttz1c9vkeifguc45",
    "name": "Riyadh Air Metropolitano",
    "shortName": "Riyadh Air Metropolitano",
    "lat": 40.436226,
    "lon": -3.59946
  },
  "380ebum8hdpxn90su6vzm4bo4": {
    "id": "8ell9vv21ntqufsr5a4qyvjlg",
    "name": "Estadio de Mestalla",
    "shortName": "Estadio de Mestalla",
    "lat": 39.474602,
    "lon": -0.358257
  },
  "3apuzcf26kfvpej8uc98l2n10": {
    "id": "4ydszy39adhtczo02as8gdqup",
    "name": "Estadio Coliseum",
    "shortName": "Estadio Coliseum",
    "lat": 40.325729,
    "lon": -3.714964
  },
  "38dsrz394cwn8gbxbm6ahnllg": {
    "id": "26ycul6lcermwam7oxr57qyny",
    "name": "Estadio de Mendizorroza",
    "shortName": "Estadio de Mendizorroza",
    "lat": 42.837076,
    "lon": -2.688247
  },
  "38r38grppqfwcb99s9ikyv6s4": {
    "id": "8igj49hbhu62z77bwtczd7zc5",
    "name": "Estadio La Cartuja de Sevilla",
    "shortName": "Estadio La Cartuja de Sevilla",
    "lat": 37.417209,
    "lon": -6.004661
  },
  "3dqveie2v1c7dydqpn40ccyl0": {
    "id": "1i6aurveqizhdsg4bgdhprlom",
    "name": "Estadio Municipal Carlos Tartiere",
    "shortName": "Estadio Municipal Carlos Tartiere",
    "lat": 43.360762,
    "lon": -5.870261
  },
  "3f8qbmbzrg2o195netsozsmxg": {
    "id": "6wek5bab1al0qtnl6pjyntp42",
    "name": "Estadio de Vallecas",
    "shortName": "Estadio de Vallecas",
    "lat": 40.391823,
    "lon": -3.658589
  },
  "3d093m8yc27r7p3gumt3gg4d0": {
    "id": "2n6pw21w4t9kc955w78ryjkyr",
    "name": "Estadio Ciudad de Valencia",
    "shortName": "Estadio Ciudad de Valencia",
    "lat": 39.494686,
    "lon": -0.36382
  },
  "3cmwlyivmqd5wesvf6o13mtjo": {
    "id": "8jpaixac05v4tl6wyhwk2drdy",
    "name": "Spotify Camp Nou",
    "shortName": "Spotify Camp Nou",
    "lat": 41.38089,
    "lon": 2.122813
  },
  "3bvyrbl5qq7s93s7yat969q1g": {
    "id": "bpfd0sk353ozrgi4jrjs5qgqs",
    "name": "Estadio Municipal de Anoeta",
    "shortName": "Estadio Municipal de Anoeta",
    "lat": 43.301376,
    "lon": -1.973602
  },
  "3ehzlcos9xo56ol70wttwmu50": {
    "id": "4rog35zkswi1nymg8o55ppiag",
    "name": "Estadio Manuel Martínez Valero",
    "shortName": "Estadio Manuel Martínez Valero",
    "lat": 38.267129,
    "lon": -0.6633
  },
  "3eve0z8ko67bbailw6nhbl3x0": {
    "id": "3y2qrs9lma04q7tntobgey3s8",
    "name": "Estadi Municipal de Montilivi",
    "shortName": "Estadi Municipal de Montilivi",
    "lat": 41.961195,
    "lon": 2.828495
  },
  "3e4k0muk9qdqz748em5e5dtzo": {
    "id": "7o6sbdki1c1b3f54ga3xj5abb",
    "name": "Estadio Bernabéu",
    "shortName": "Estadio Bernabéu",
    "lat": 40.453068,
    "lon": -3.688354
  },
  "3ddiuilkmzwc7z89f5cjy1pn8": {
    "id": "awbbogt2i6macegd87pre8044",
    "name": "Estadi Mallorca Son Moix",
    "shortName": "Estadi Mallorca Son Moix",
    "lat": 39.58994,
    "lon": 2.630078
  },
  "3c9hm7srm769qr9qfg4prhlhw": {
    "id": "3tsyaiz1y1gg31xw81qgtrx4w",
    "name": "Estadio de San Mamés",
    "shortName": "Estadio de San Mamés",
    "lat": 43.264173,
    "lon": -2.949383
  },
  "348p051ww3c5h5f7yu6puqplg": {
    "id": "2n6pw21w4t9kc955w78ryjkyr",
    "name": "Estadio Ciudad de Valencia",
    "shortName": "Estadio Ciudad de Valencia",
    "lat": 39.494686,
    "lon": -0.36382
  },
  "34zj5er2za9qrjro5eq94ack4": {
    "id": "3tsyaiz1y1gg31xw81qgtrx4w",
    "name": "Estadio de San Mamés",
    "shortName": "Estadio de San Mamés",
    "lat": 43.264173,
    "lon": -2.949383
  },
  "35q4pov6mhtlujc68n1nz7bpw": {
    "id": "8z6nwwiy8h2kqq7z3yxf7aqti",
    "name": "Estadio Abanca-Balaídos",
    "shortName": "Estadio Abanca-Balaídos",
    "lat": 42.211852,
    "lon": -8.739721
  },
  "36img9yditg3x8kvo810l3ims": {
    "id": "awbbogt2i6macegd87pre8044",
    "name": "Estadi Mallorca Son Moix",
    "shortName": "Estadi Mallorca Son Moix",
    "lat": 39.58994,
    "lon": 2.630078
  },
  "37mlon39zla9t9jjetz0zei38": {
    "id": "23fwsofybpbwfcxjrysy6on19",
    "name": "Estadio El Sadar",
    "shortName": "Estadio El Sadar",
    "lat": 42.796677,
    "lon": -1.637141
  },
  "3799288svdt7jtyvzloemtt04": {
    "id": "81guly6ecfrnsu6pfs0qqb1ik",
    "name": "Estadio Ramón Sánchez Pizjuán",
    "shortName": "Estadio Ramón Sánchez Pizjuán",
    "lat": 37.384046,
    "lon": -5.970592
  },
  "35cufmoxi0kf40kxn49gj71g4": {
    "id": "8jpaixac05v4tl6wyhwk2drdy",
    "name": "Spotify Camp Nou",
    "shortName": "Spotify Camp Nou",
    "lat": 41.38089,
    "lon": 2.122813
  },
  "363nbiu36arb8us8vuxlizqc4": {
    "id": "4rog35zkswi1nymg8o55ppiag",
    "name": "Estadio Manuel Martínez Valero",
    "shortName": "Estadio Manuel Martínez Valero",
    "lat": 38.267129,
    "lon": -0.6633
  },
  "36vy9cu402k8m0goxchkpmpzo": {
    "id": "bpfd0sk353ozrgi4jrjs5qgqs",
    "name": "Estadio Municipal de Anoeta",
    "shortName": "Estadio Municipal de Anoeta",
    "lat": 43.301376,
    "lon": -1.973602
  },
  "34m6ahxmkq28k9h8al6i9gsno": {
    "id": "7o6sbdki1c1b3f54ga3xj5abb",
    "name": "Estadio Bernabéu",
    "shortName": "Estadio Bernabéu",
    "lat": 40.453068,
    "lon": -3.688354
  },
  "32qxs3ohgfo1bgb2g7k7we9zo": {
    "id": "3y2qrs9lma04q7tntobgey3s8",
    "name": "Estadi Municipal de Montilivi",
    "shortName": "Estadi Municipal de Montilivi",
    "lat": 41.961195,
    "lon": 2.828495
  },
  "31mkjysd2ypln9u9s88ge8qhg": {
    "id": "26ycul6lcermwam7oxr57qyny",
    "name": "Estadio de Mendizorroza",
    "shortName": "Estadio de Mendizorroza",
    "lat": 42.837076,
    "lon": -2.688247
  },
  "33hvcbq5xmb0wo3x4r5p3w1ec": {
    "id": "1i6aurveqizhdsg4bgdhprlom",
    "name": "Estadio Municipal Carlos Tartiere",
    "shortName": "Estadio Municipal Carlos Tartiere",
    "lat": 43.360762,
    "lon": -5.870261
  },
  "30gnuehy43on5orc9n3sh8pw4": {
    "id": "8ell9vv21ntqufsr5a4qyvjlg",
    "name": "Estadio de Mestalla",
    "shortName": "Estadio de Mestalla",
    "lat": 39.474602,
    "lon": -0.358257
  },
  "33vcbxcbnojlxdm39q4elkutw": {
    "id": "4ydszy39adhtczo02as8gdqup",
    "name": "Estadio Coliseum",
    "shortName": "Estadio Coliseum",
    "lat": 40.325729,
    "lon": -3.714964
  },
  "31zxsexwgw81km23uib95otuc": {
    "id": "4dki5bxv1ttz1c9vkeifguc45",
    "name": "Riyadh Air Metropolitano",
    "shortName": "Riyadh Air Metropolitano",
    "lat": 40.436226,
    "lon": -3.59946
  },
  "32dgfvl5v0zo942n2e2zihfdg": {
    "id": "8igj49hbhu62z77bwtczd7zc5",
    "name": "Estadio La Cartuja de Sevilla",
    "shortName": "Estadio La Cartuja de Sevilla",
    "lat": 37.417209,
    "lon": -6.004661
  },
  "334grr0hqs8zr92mx518hdjpw": {
    "id": "awbbogt2i6macegd87pre8044",
    "name": "Estadi Mallorca Son Moix",
    "shortName": "Estadi Mallorca Son Moix",
    "lat": 39.58994,
    "lon": 2.630078
  },
  "317f8nnd5kiqw5pomd91v86j8": {
    "id": "bpfd0sk353ozrgi4jrjs5qgqs",
    "name": "Estadio Municipal de Anoeta",
    "shortName": "Estadio Municipal de Anoeta",
    "lat": 43.301376,
    "lon": -1.973602
  },
  "30u02n6fw3bxc2lk51wv1cowk": {
    "id": "6wek5bab1al0qtnl6pjyntp42",
    "name": "Estadio de Vallecas",
    "shortName": "Estadio de Vallecas",
    "lat": 40.391823,
    "lon": -3.658589
  },
  "2wpgnr91h1yid0zf4zu0y5afo": {
    "id": "7o6sbdki1c1b3f54ga3xj5abb",
    "name": "Estadio Bernabéu",
    "shortName": "Estadio Bernabéu",
    "lat": 40.453068,
    "lon": -3.688354
  },
  "2xuajcyluofrmnt1siit15jbo": {
    "id": "3tsyaiz1y1gg31xw81qgtrx4w",
    "name": "Estadio de San Mamés",
    "shortName": "Estadio de San Mamés",
    "lat": 43.264173,
    "lon": -2.949383
  },
  "3036nph9xhmltiks40aso8lck": {
    "id": "8z6nwwiy8h2kqq7z3yxf7aqti",
    "name": "Estadio Abanca-Balaídos",
    "shortName": "Estadio Abanca-Balaídos",
    "lat": 42.211852,
    "lon": -8.739721
  },
  "2y7mqtoumr3710vgfit7046j8": {
    "id": "8jpaixac05v4tl6wyhwk2drdy",
    "name": "Spotify Camp Nou",
    "shortName": "Spotify Camp Nou",
    "lat": 41.38089,
    "lon": 2.122813
  },
  "2zpoy8pxorsqwffemhjkcff2s": {
    "id": "81guly6ecfrnsu6pfs0qqb1ik",
    "name": "Estadio Ramón Sánchez Pizjuán",
    "shortName": "Estadio Ramón Sánchez Pizjuán",
    "lat": 37.384046,
    "lon": -5.970592
  },
  "2zc6div45o8artjqg9vrawb2s": {
    "id": "2n6pw21w4t9kc955w78ryjkyr",
    "name": "Estadio Ciudad de Valencia",
    "shortName": "Estadio Ciudad de Valencia",
    "lat": 39.494686,
    "lon": -0.36382
  },
  "2x2xudpjc4s1hoolcluxehudw": {
    "id": "23fwsofybpbwfcxjrysy6on19",
    "name": "Estadio El Sadar",
    "shortName": "Estadio El Sadar",
    "lat": 42.796677,
    "lon": -1.637141
  },
  "2yypobxbbgweakpwxt4090v10": {
    "id": "46sq3vgaf79kjl0yd82jm3t5n",
    "name": "RCDE Stadium",
    "shortName": "RCDE Stadium",
    "lat": 41.34786,
    "lon": 2.075622
  },
  "2yl5s151fw9kjhq3j3dx1g2l0": {
    "id": "4rog35zkswi1nymg8o55ppiag",
    "name": "Estadio Manuel Martínez Valero",
    "shortName": "Estadio Manuel Martínez Valero",
    "lat": 38.267129,
    "lon": -0.6633
  },
  "2xgn2f7ghbsseb9afxdo1atqs": {
    "id": "d9i7k0es5x4ccxcapt1fcg9c2",
    "name": "Estadio de la Cerámica",
    "shortName": "Estadio de la Cerámica",
    "lat": 39.944119,
    "lon": -0.103474
  },
  "2toal4qg8ohxn3hh50m9lrac4": {
    "id": "6wek5bab1al0qtnl6pjyntp42",
    "name": "Estadio de Vallecas",
    "shortName": "Estadio de Vallecas",
    "lat": 40.391823,
    "lon": -3.658589
  },
  "2uf6893vxahtyej21o0yj2vbo": {
    "id": "bpfd0sk353ozrgi4jrjs5qgqs",
    "name": "Estadio Municipal de Anoeta",
    "shortName": "Estadio Municipal de Anoeta",
    "lat": 43.301376,
    "lon": -1.973602
  },
  "2vji7tw0khxdvfeo52geb0jkk": {
    "id": "8igj49hbhu62z77bwtczd7zc5",
    "name": "Estadio La Cartuja de Sevilla",
    "shortName": "Estadio La Cartuja de Sevilla",
    "lat": 37.417209,
    "lon": -6.004661
  },
  "2v65xqf9xnj8r2gxj9akbtqfo": {
    "id": "8jpaixac05v4tl6wyhwk2drdy",
    "name": "Spotify Camp Nou",
    "shortName": "Spotify Camp Nou",
    "lat": 41.38089,
    "lon": 2.122813
  },
  "2taxjp7kgsyqb2x6zjjbiwys4": {
    "id": "awbbogt2i6macegd87pre8044",
    "name": "Estadi Mallorca Son Moix",
    "shortName": "Estadi Mallorca Son Moix",
    "lat": 39.58994,
    "lon": 2.630078
  },
  "2sx9kf2syjyyqwaxz74i46n10": {
    "id": "7o6sbdki1c1b3f54ga3xj5abb",
    "name": "Estadio Bernabéu",
    "shortName": "Estadio Bernabéu",
    "lat": 40.453068,
    "lon": -3.688354
  },
  "2vwyt47ub9v6e27mu6ddaxhqs": {
    "id": "1i6aurveqizhdsg4bgdhprlom",
    "name": "Estadio Municipal Carlos Tartiere",
    "shortName": "Estadio Municipal Carlos Tartiere",
    "lat": 43.360762,
    "lon": -5.870261
  },
  "2usu4a3m9ufgguju2iqilurys": {
    "id": "4dki5bxv1ttz1c9vkeifguc45",
    "name": "Riyadh Air Metropolitano",
    "shortName": "Riyadh Air Metropolitano",
    "lat": 40.436226,
    "lon": -3.59946
  },
  "2wafcyp42h9q6jqi5chgfl3x0": {
    "id": "3y2qrs9lma04q7tntobgey3s8",
    "name": "Estadi Municipal de Montilivi",
    "shortName": "Estadi Municipal de Montilivi",
    "lat": 41.961195,
    "lon": 2.828495
  },
  "2u1nsiwpvio7gzjecn4cnhq8k": {
    "id": "26ycul6lcermwam7oxr57qyny",
    "name": "Estadio de Mendizorroza",
    "shortName": "Estadio de Mendizorroza",
    "lat": 42.837076,
    "lon": -2.688247
  },
  "2rdu4yg44ic1xh5ymhhx1yolw": {
    "id": "46sq3vgaf79kjl0yd82jm3t5n",
    "name": "RCDE Stadium",
    "shortName": "RCDE Stadium",
    "lat": 41.34786,
    "lon": 2.075622
  },
  "2rswicw0gb42ehlbg8gcvyjh0": {
    "id": "8ell9vv21ntqufsr5a4qyvjlg",
    "name": "Estadio de Mestalla",
    "shortName": "Estadio de Mestalla",
    "lat": 39.474602,
    "lon": -0.358257
  },
  "2pwdpb63byqohajaokb5793pw": {
    "id": "81guly6ecfrnsu6pfs0qqb1ik",
    "name": "Estadio Ramón Sánchez Pizjuán",
    "shortName": "Estadio Ramón Sánchez Pizjuán",
    "lat": 37.384046,
    "lon": -5.970592
  },
  "2s67ol8ci5kpjktfuw80c58gk": {
    "id": "4ydszy39adhtczo02as8gdqup",
    "name": "Estadio Coliseum",
    "shortName": "Estadio Coliseum",
    "lat": 40.325729,
    "lon": -3.714964
  },
  "2sjqtzqw7toxdc5xpqu843vh0": {
    "id": "d9i7k0es5x4ccxcapt1fcg9c2",
    "name": "Estadio de la Cerámica",
    "shortName": "Estadio de la Cerámica",
    "lat": 39.944119,
    "lon": -0.103474
  },
  "2q9tc31q3pa181h1jnjxvfqc4": {
    "id": "3tsyaiz1y1gg31xw81qgtrx4w",
    "name": "Estadio de San Mamés",
    "shortName": "Estadio de San Mamés",
    "lat": 43.264173,
    "lon": -2.949383
  },
  "2qn6lwhn5o37o0hl1unj5hl3o": {
    "id": "4dki5bxv1ttz1c9vkeifguc45",
    "name": "Riyadh Air Metropolitano",
    "shortName": "Riyadh Air Metropolitano",
    "lat": 40.436226,
    "lon": -3.59946
  },
  "2p5lebd6sut2o58yyixozunmc": {
    "id": "2n6pw21w4t9kc955w78ryjkyr",
    "name": "Estadio Ciudad de Valencia",
    "shortName": "Estadio Ciudad de Valencia",
    "lat": 39.494686,
    "lon": -0.36382
  },
  "2pivvji4pf47xn5ziqca3ttlg": {
    "id": "23fwsofybpbwfcxjrysy6on19",
    "name": "Estadio El Sadar",
    "shortName": "Estadio El Sadar",
    "lat": 42.796677,
    "lon": -1.637141
  },
  "2r0l3iazgy14lquy2273uny1g": {
    "id": "8z6nwwiy8h2kqq7z3yxf7aqti",
    "name": "Estadio Abanca-Balaídos",
    "shortName": "Estadio Abanca-Balaídos",
    "lat": 42.211852,
    "lon": -8.739721
  },
  "2byg0dchhk26dnihjtq1wa0pg": {
    "id": "6wek5bab1al0qtnl6pjyntp42",
    "name": "Estadio de Vallecas",
    "shortName": "Estadio de Vallecas",
    "lat": 40.391823,
    "lon": -3.658589
  },
  "2m4sef2l4im49rda90k3p41lg": {
    "id": "7o6sbdki1c1b3f54ga3xj5abb",
    "name": "Estadio Bernabéu",
    "shortName": "Estadio Bernabéu",
    "lat": 40.453068,
    "lon": -3.688354
  },
  "2lrcyrg6x6b1wz9q1xeyggkyc": {
    "id": "3y2qrs9lma04q7tntobgey3s8",
    "name": "Estadi Municipal de Montilivi",
    "shortName": "Estadi Municipal de Montilivi",
    "lat": 41.961195,
    "lon": 2.828495
  },
  "2napzcxsfy1ju0ixutyi6z8yc": {
    "id": "8igj49hbhu62z77bwtczd7zc5",
    "name": "Estadio La Cartuja de Sevilla",
    "shortName": "Estadio La Cartuja de Sevilla",
    "lat": 37.417209,
    "lon": -6.004661
  },
  "2mieos6z7lqo2pb9bsl6j0xsk": {
    "id": "8ell9vv21ntqufsr5a4qyvjlg",
    "name": "Estadio de Mestalla",
    "shortName": "Estadio de Mestalla",
    "lat": 39.474602,
    "lon": -0.358257
  },
  "2no6er6enaks2abnft8fknndg": {
    "id": "4rog35zkswi1nymg8o55ppiag",
    "name": "Estadio Manuel Martínez Valero",
    "shortName": "Estadio Manuel Martínez Valero",
    "lat": 38.267129,
    "lon": -0.6633
  },
  "2ldv2nafpzvwhdympdp0rff9w": {
    "id": "1i6aurveqizhdsg4bgdhprlom",
    "name": "Estadio Municipal Carlos Tartiere",
    "shortName": "Estadio Municipal Carlos Tartiere",
    "lat": 43.360762,
    "lon": -5.870261
  },
  "2o1qezfdq50juhi4b82nyesk4": {
    "id": "awbbogt2i6macegd87pre8044",
    "name": "Estadi Mallorca Son Moix",
    "shortName": "Estadi Mallorca Son Moix",
    "lat": 39.58994,
    "lon": 2.630078
  },
  "2mxi4zs0db40fjabi1d36b9ck": {
    "id": "8jpaixac05v4tl6wyhwk2drdy",
    "name": "Spotify Camp Nou",
    "shortName": "Spotify Camp Nou",
    "lat": 41.38089,
    "lon": 2.122813
  },
  "2osbe65qugeqj4btj6y4t4pas": {
    "id": "6wek5bab1al0qtnl6pjyntp42",
    "name": "Estadio de Vallecas",
    "shortName": "Estadio de Vallecas",
    "lat": 40.391823,
    "lon": -3.658589
  },
  "2of0ec1j3qlwnm140nciptixg": {
    "id": "2n6pw21w4t9kc955w78ryjkyr",
    "name": "Estadio Ciudad de Valencia",
    "shortName": "Estadio Ciudad de Valencia",
    "lat": 39.494686,
    "lon": -0.36382
  },
  "2j5gbrfdr52r652taci2oin84": {
    "id": "26ycul6lcermwam7oxr57qyny",
    "name": "Estadio de Mendizorroza",
    "shortName": "Estadio de Mendizorroza",
    "lat": 42.837076,
    "lon": -2.688247
  },
  "2ieudkqygyu0aa32xvmgllc7o": {
    "id": "d9i7k0es5x4ccxcapt1fcg9c2",
    "name": "Estadio de la Cerámica",
    "shortName": "Estadio de la Cerámica",
    "lat": 39.944119,
    "lon": -0.103474
  },
  "2l0hlraqbbo3sgfhtv0iaa49g": {
    "id": "8z6nwwiy8h2kqq7z3yxf7aqti",
    "name": "Estadio Abanca-Balaídos",
    "shortName": "Estadio Abanca-Balaídos",
    "lat": 42.211852,
    "lon": -8.739721
  },
  "2k9uw8chd5ol6b9rrw5ftnc44": {
    "id": "8jpaixac05v4tl6wyhwk2drdy",
    "name": "Spotify Camp Nou",
    "shortName": "Spotify Camp Nou",
    "lat": 41.38089,
    "lon": 2.122813
  },
  "2hktnqo0d8lx8h65s2ac67ac4": {
    "id": "4ydszy39adhtczo02as8gdqup",
    "name": "Estadio Coliseum",
    "shortName": "Estadio Coliseum",
    "lat": 40.325729,
    "lon": -3.714964
  },
  "2jwf7cpzm72lrajndbtk03das": {
    "id": "4dki5bxv1ttz1c9vkeifguc45",
    "name": "Riyadh Air Metropolitano",
    "shortName": "Riyadh Air Metropolitano",
    "lat": 40.436226,
    "lon": -3.59946
  },
  "2i1fz7uysfcivnrqrbpsybfo4": {
    "id": "23fwsofybpbwfcxjrysy6on19",
    "name": "Estadio El Sadar",
    "shortName": "Estadio El Sadar",
    "lat": 42.796677,
    "lon": -1.637141
  },
  "2kn874mea28rs8m0s333xmp78": {
    "id": "8igj49hbhu62z77bwtczd7zc5",
    "name": "Estadio La Cartuja de Sevilla",
    "shortName": "Estadio La Cartuja de Sevilla",
    "lat": 37.417209,
    "lon": -6.004661
  },
  "2is2f0giwb65xpuanzsstcs2c": {
    "id": "bpfd0sk353ozrgi4jrjs5qgqs",
    "name": "Estadio Municipal de Anoeta",
    "shortName": "Estadio Municipal de Anoeta",
    "lat": 43.301376,
    "lon": -1.973602
  },
  "2jiyipev8f7wvnf4rp16n8n4k": {
    "id": "3tsyaiz1y1gg31xw81qgtrx4w",
    "name": "Estadio de San Mamés",
    "shortName": "Estadio de San Mamés",
    "lat": 43.264173,
    "lon": -2.949383
  },
  "1jlhapyjldhvatexkb19ja6fo": {
    "id": "2n6pw21w4t9kc955w78ryjkyr",
    "name": "Estadio Ciudad de Valencia",
    "shortName": "Estadio Ciudad de Valencia",
    "lat": 39.494686,
    "lon": -0.36382
  },
  "2elfffvt87h2apmhh2c0et3pw": {
    "id": "3y2qrs9lma04q7tntobgey3s8",
    "name": "Estadi Municipal de Montilivi",
    "shortName": "Estadi Municipal de Montilivi",
    "lat": 41.961195,
    "lon": 2.828495
  },
  "2eyrfe9uog3f5s72qy88imxp0": {
    "id": "awbbogt2i6macegd87pre8044",
    "name": "Estadi Mallorca Son Moix",
    "shortName": "Estadi Mallorca Son Moix",
    "lat": 39.58994,
    "lon": 2.630078
  },
  "2ggfagcn46v6b5rbqpgdj7das": {
    "id": "2n6pw21w4t9kc955w78ryjkyr",
    "name": "Estadio Ciudad de Valencia",
    "shortName": "Estadio Ciudad de Valencia",
    "lat": 39.494686,
    "lon": -0.36382
  },
  "2e85uzw4i0hdq9tlf0m02mo7o": {
    "id": "emjk2wbulbnruj028iwz6lznl",
    "name": "Estadio Ontime Butarque",
    "shortName": "Estadio Ontime Butarque",
    "lat": 40.340472,
    "lon": -3.760688
  },
  "2dut8dksy5wicxc8bk1fy582c": {
    "id": "1i6aurveqizhdsg4bgdhprlom",
    "name": "Estadio Municipal Carlos Tartiere",
    "shortName": "Estadio Municipal Carlos Tartiere",
    "lat": 43.360762,
    "lon": -5.870261
  },
  "2gtyyqnsw87ojqc60b9b50dn8": {
    "id": "7o6sbdki1c1b3f54ga3xj5abb",
    "name": "Estadio Bernabéu",
    "shortName": "Estadio Bernabéu",
    "lat": 40.453068,
    "lon": -3.688354
  },
  "2h7d8ukaxlbxzfalz2jej5us4": {
    "id": "81guly6ecfrnsu6pfs0qqb1ik",
    "name": "Estadio Ramón Sánchez Pizjuán",
    "shortName": "Estadio Ramón Sánchez Pizjuán",
    "lat": 37.384046,
    "lon": -5.970592
  },
  "2g2ynxffaiw8no1j61y45vvh0": {
    "id": "4ydszy39adhtczo02as8gdqup",
    "name": "Estadio Coliseum",
    "shortName": "Estadio Coliseum",
    "lat": 40.325729,
    "lon": -3.714964
  },
  "2fc1kvignx7oybca1wqs2gsgk": {
    "id": "46sq3vgaf79kjl0yd82jm3t5n",
    "name": "RCDE Stadium",
    "shortName": "RCDE Stadium",
    "lat": 41.34786,
    "lon": 2.075622
  },
  "2fpgp04qfqn3zanmznei2zmdw": {
    "id": "4rog35zkswi1nymg8o55ppiag",
    "name": "Estadio Manuel Martínez Valero",
    "shortName": "Estadio Manuel Martínez Valero",
    "lat": 38.267129,
    "lon": -0.6633
  },
  "2au8colu3pbwws92o9q03i9zo": {
    "id": "d9i7k0es5x4ccxcapt1fcg9c2",
    "name": "Estadio de la Cerámica",
    "shortName": "Estadio de la Cerámica",
    "lat": 39.944119,
    "lon": -0.103474
  },
  "2bl3hdm49yj3nhnvngy8p6qs4": {
    "id": "8ell9vv21ntqufsr5a4qyvjlg",
    "name": "Estadio de Mestalla",
    "shortName": "Estadio de Mestalla",
    "lat": 39.474602,
    "lon": -0.358257
  },
  "2d48hhckok4yi8bluy55trf2s": {
    "id": "4dki5bxv1ttz1c9vkeifguc45",
    "name": "Riyadh Air Metropolitano",
    "shortName": "Riyadh Air Metropolitano",
    "lat": 40.436226,
    "lon": -3.59946
  },
  "2cp6ugeg62t6fg02bkkkukums": {
    "id": "3tsyaiz1y1gg31xw81qgtrx4w",
    "name": "Estadio de San Mamés",
    "shortName": "Estadio de San Mamés",
    "lat": 43.264173,
    "lon": -2.949383
  },
  "2b7m8c3nipodfdjjb4e6akqok": {
    "id": "81guly6ecfrnsu6pfs0qqb1ik",
    "name": "Estadio Ramón Sánchez Pizjuán",
    "shortName": "Estadio Ramón Sánchez Pizjuán",
    "lat": 37.384046,
    "lon": -5.970592
  },
  "2cbrliiyprq7a205rp3w1qz9w": {
    "id": "26ycul6lcermwam7oxr57qyny",
    "name": "Estadio de Mendizorroza",
    "shortName": "Estadio de Mendizorroza",
    "lat": 42.837076,
    "lon": -2.688247
  },
  "2agwdhyd4f3pb3wugya4art3o": {
    "id": "bpfd0sk353ozrgi4jrjs5qgqs",
    "name": "Estadio Municipal de Anoeta",
    "shortName": "Estadio Municipal de Anoeta",
    "lat": 43.301376,
    "lon": -1.973602
  },
  "2dhi57c0oalm6wvrjttsm44k4": {
    "id": "8jpaixac05v4tl6wyhwk2drdy",
    "name": "Spotify Camp Nou",
    "shortName": "Spotify Camp Nou",
    "lat": 41.38089,
    "lon": 2.122813
  },
  "2a3fi3txct0dmxzfexhl3to2c": {
    "id": "8z6nwwiy8h2kqq7z3yxf7aqti",
    "name": "Estadio Abanca-Balaídos",
    "shortName": "Estadio Abanca-Balaídos",
    "lat": 42.211852,
    "lon": -8.739721
  },
  "28z661pl07w40fr1in36f97o4": {
    "id": "awbbogt2i6macegd87pre8044",
    "name": "Estadi Mallorca Son Moix",
    "shortName": "Estadi Mallorca Son Moix",
    "lat": 39.58994,
    "lon": 2.630078
  },
  "288lesgslzcbljs163839jl04": {
    "id": "3tsyaiz1y1gg31xw81qgtrx4w",
    "name": "Estadio de San Mamés",
    "shortName": "Estadio de San Mamés",
    "lat": 43.264173,
    "lon": -2.949383
  },
  "272epdgf25skn7iaizs21mzh0": {
    "id": "4ydszy39adhtczo02as8gdqup",
    "name": "Estadio Coliseum",
    "shortName": "Estadio Coliseum",
    "lat": 40.325729,
    "lon": -3.714964
  },
  "28lvz9j35a3we5r2jy9lff7dg": {
    "id": "8igj49hbhu62z77bwtczd7zc5",
    "name": "Estadio La Cartuja de Sevilla",
    "shortName": "Estadio La Cartuja de Sevilla",
    "lat": 37.417209,
    "lon": -6.004661
  },
  "27t0dyh53751craqajb3o62hg": {
    "id": "7o6sbdki1c1b3f54ga3xj5abb",
    "name": "Estadio Bernabéu",
    "shortName": "Estadio Bernabéu",
    "lat": 40.453068,
    "lon": -3.688354
  },
  "26p4gv6nxij3gqaoea17rxct0": {
    "id": "4rog35zkswi1nymg8o55ppiag",
    "name": "Estadio Manuel Martínez Valero",
    "shortName": "Estadio Manuel Martínez Valero",
    "lat": 38.267129,
    "lon": -0.6633
  },
  "26bsh372a4004fxjzg381qgb8": {
    "id": "2n6pw21w4t9kc955w78ryjkyr",
    "name": "Estadio Ciudad de Valencia",
    "shortName": "Estadio Ciudad de Valencia",
    "lat": 39.494686,
    "lon": -0.36382
  },
  "29cmof9w51qvhnakmp2oado9g": {
    "id": "23fwsofybpbwfcxjrysy6on19",
    "name": "Estadio El Sadar",
    "shortName": "Estadio El Sadar",
    "lat": 42.796677,
    "lon": -1.637141
  },
  "27fpawpnvii11w6oxcgm7a80k": {
    "id": "1i6aurveqizhdsg4bgdhprlom",
    "name": "Estadio Municipal Carlos Tartiere",
    "shortName": "Estadio Municipal Carlos Tartiere",
    "lat": 43.360762,
    "lon": -5.870261
  },
  "29q144duutijtrpdfzof1zims": {
    "id": "46sq3vgaf79kjl0yd82jm3t5n",
    "name": "RCDE Stadium",
    "shortName": "RCDE Stadium",
    "lat": 41.34786,
    "lon": 2.075622
  },
  "23c7lgceh27fdelyfo5a4ygwk": {
    "id": "3y2qrs9lma04q7tntobgey3s8",
    "name": "Estadi Municipal de Montilivi",
    "shortName": "Estadi Municipal de Montilivi",
    "lat": 41.961195,
    "lon": 2.828495
  },
  "24ggs30od6yf2dz3uyz8zjlec": {
    "id": "26ycul6lcermwam7oxr57qyny",
    "name": "Estadio de Mendizorroza",
    "shortName": "Estadio de Mendizorroza",
    "lat": 42.837076,
    "lon": -2.688247
  },
  "25yd18qv80e97mjmlmv5vc4r8": {
    "id": "bpfd0sk353ozrgi4jrjs5qgqs",
    "name": "Estadio Municipal de Anoeta",
    "shortName": "Estadio Municipal de Anoeta",
    "lat": 43.301376,
    "lon": -1.973602
  },
  "257ci0bd6g6l3uk1fn5a0ob2s": {
    "id": "8jpaixac05v4tl6wyhwk2drdy",
    "name": "Spotify Camp Nou",
    "shortName": "Spotify Camp Nou",
    "lat": 41.38089,
    "lon": 2.122813
  },
  "24tv2ajrcwbqaq46kxd54mgpg": {
    "id": "4dki5bxv1ttz1c9vkeifguc45",
    "name": "Riyadh Air Metropolitano",
    "shortName": "Riyadh Air Metropolitano",
    "lat": 40.436226,
    "lon": -3.59946
  },
  "242xbwdul3xv3pwz602l6btw4": {
    "id": "d9i7k0es5x4ccxcapt1fcg9c2",
    "name": "Estadio de la Cerámica",
    "shortName": "Estadio de la Cerámica",
    "lat": 39.944119,
    "lon": -0.103474
  },
  "25kz3clipo3v4d1gp3m23n5ec": {
    "id": "81guly6ecfrnsu6pfs0qqb1ik",
    "name": "Estadio Ramón Sánchez Pizjuán",
    "shortName": "Estadio Ramón Sánchez Pizjuán",
    "lat": 37.384046,
    "lon": -5.970592
  },
  "22x7y5lc2ynqrwdkh5kl64a38": {
    "id": "8ell9vv21ntqufsr5a4qyvjlg",
    "name": "Estadio de Mestalla",
    "shortName": "Estadio de Mestalla",
    "lat": 39.474602,
    "lon": -0.358257
  },
  "23ph16hry56w3gdhgy3s5pafo": {
    "id": "6wek5bab1al0qtnl6pjyntp42",
    "name": "Estadio de Vallecas",
    "shortName": "Estadio de Vallecas",
    "lat": 40.391823,
    "lon": -3.658589
  },
  "22jwwfu5djp7vwtjkvcujieqc": {
    "id": "2n6pw21w4t9kc955w78ryjkyr",
    "name": "Estadio Ciudad de Valencia",
    "shortName": "Estadio Ciudad de Valencia",
    "lat": 39.494686,
    "lon": -0.36382
  },
  "21t9p2uvl57vfs1xsytfooxzo": {
    "id": "4rog35zkswi1nymg8o55ppiag",
    "name": "Estadio Manuel Martínez Valero",
    "shortName": "Estadio Manuel Martínez Valero",
    "lat": 38.267129,
    "lon": -0.6633
  },
  "20boml0nnzxlvqvyy0ylfxdlg": {
    "id": "bpfd0sk353ozrgi4jrjs5qgqs",
    "name": "Estadio Municipal de Anoeta",
    "shortName": "Estadio Municipal de Anoeta",
    "lat": 43.301376,
    "lon": -1.973602
  },
  "21fk37khnhcggf2uk9kxgl638": {
    "id": "8z6nwwiy8h2kqq7z3yxf7aqti",
    "name": "Estadio Abanca-Balaídos",
    "shortName": "Estadio Abanca-Balaídos",
    "lat": 42.211852,
    "lon": -8.739721
  },
  "1zkz16jzrxddg9c05edk2znys": {
    "id": "4dki5bxv1ttz1c9vkeifguc45",
    "name": "Riyadh Air Metropolitano",
    "shortName": "Riyadh Air Metropolitano",
    "lat": 40.436226,
    "lon": -3.59946
  },
  "1yshj5s9yj440ar0xld31xxqs": {
    "id": "4ydszy39adhtczo02as8gdqup",
    "name": "Estadio Coliseum",
    "shortName": "Estadio Coliseum",
    "lat": 40.325729,
    "lon": -3.714964
  },
  "212c0txlhb4ljff92d2cu5edw": {
    "id": "8igj49hbhu62z77bwtczd7zc5",
    "name": "Estadio La Cartuja de Sevilla",
    "shortName": "Estadio La Cartuja de Sevilla",
    "lat": 37.417209,
    "lon": -6.004661
  },
  "1z79bgsg0g4xojqjpoxolh1ck": {
    "id": "23fwsofybpbwfcxjrysy6on19",
    "name": "Estadio El Sadar",
    "shortName": "Estadio El Sadar",
    "lat": 42.796677,
    "lon": -1.637141
  },
  "1zyd1rcyvotux5kjh936dehp0": {
    "id": "awbbogt2i6macegd87pre8044",
    "name": "Estadi Mallorca Son Moix",
    "shortName": "Estadi Mallorca Son Moix",
    "lat": 39.58994,
    "lon": 2.630078
  },
  "20p4cff79mu4mto9rpw2sdj4k": {
    "id": "7o6sbdki1c1b3f54ga3xj5abb",
    "name": "Estadio Bernabéu",
    "shortName": "Estadio Bernabéu",
    "lat": 40.453068,
    "lon": -3.688354
  },
  "226m1xys6v816jac3sck3d3is": {
    "id": "46sq3vgaf79kjl0yd82jm3t5n",
    "name": "RCDE Stadium",
    "shortName": "RCDE Stadium",
    "lat": 41.34786,
    "lon": 2.075622
  },
  "1w0ngrj3bf0ruv81ra4w2muj8": {
    "id": "81guly6ecfrnsu6pfs0qqb1ik",
    "name": "Estadio Ramón Sánchez Pizjuán",
    "shortName": "Estadio Ramón Sánchez Pizjuán",
    "lat": 37.384046,
    "lon": -5.970592
  },
  "1wrc3h54fm3azopbuu3iq7b4k": {
    "id": "2n6pw21w4t9kc955w78ryjkyr",
    "name": "Estadio Ciudad de Valencia",
    "shortName": "Estadio Ciudad de Valencia",
    "lat": 39.494686,
    "lon": -0.36382
  },
  "1x4ja8gant6mmc4sm9odbjcpg": {
    "id": "6wek5bab1al0qtnl6pjyntp42",
    "name": "Estadio de Vallecas",
    "shortName": "Estadio de Vallecas",
    "lat": 40.391823,
    "lon": -3.658589
  },
  "1wdy4ggbun88lgjv5mhlw53pw": {
    "id": "8ell9vv21ntqufsr5a4qyvjlg",
    "name": "Estadio de Mestalla",
    "shortName": "Estadio de Mestalla",
    "lat": 39.474602,
    "lon": -0.358257
  },
  "1ydvgoo74zv2bvij485wtc93o": {
    "id": "3y2qrs9lma04q7tntobgey3s8",
    "name": "Estadi Municipal de Montilivi",
    "shortName": "Estadi Municipal de Montilivi",
    "lat": 41.961195,
    "lon": 2.828495
  },
  "1uwb3z5cnpg9o84qdcr5r2o7o": {
    "id": "d9i7k0es5x4ccxcapt1fcg9c2",
    "name": "Estadio de la Cerámica",
    "shortName": "Estadio de la Cerámica",
    "lat": 39.944119,
    "lon": -0.103474
  },
  "1vn4i7o4gvzy4wej9uoz5qz9w": {
    "id": "1i6aurveqizhdsg4bgdhprlom",
    "name": "Estadio Municipal Carlos Tartiere",
    "shortName": "Estadio Municipal Carlos Tartiere",
    "lat": 43.360762,
    "lon": -5.870261
  },
  "1xweeu166hhelv9hh9l8lnpjo": {
    "id": "4ydszy39adhtczo02as8gdqup",
    "name": "Estadio Coliseum",
    "shortName": "Estadio Coliseum",
    "lat": 40.325729,
    "lon": -3.714964
  },
  "1rhyonqt5a171xvtvluwo5p1w": {
    "id": "bpfd0sk353ozrgi4jrjs5qgqs",
    "name": "Estadio Municipal de Anoeta",
    "shortName": "Estadio Municipal de Anoeta",
    "lat": 43.301376,
    "lon": -1.973602
  },
  "1ts1vbi2mugv1401ifojdtqtw": {
    "id": "26ycul6lcermwam7oxr57qyny",
    "name": "Estadio de Mendizorroza",
    "shortName": "Estadio de Mendizorroza",
    "lat": 42.837076,
    "lon": -2.688247
  },
  "1szis91vby48oriy7er25lams": {
    "id": "awbbogt2i6macegd87pre8044",
    "name": "Estadi Mallorca Son Moix",
    "shortName": "Estadi Mallorca Son Moix",
    "lat": 39.58994,
    "lon": 2.630078
  },
  "1s8ry79zt6zhqqa2eoakvm904": {
    "id": "7o6sbdki1c1b3f54ga3xj5abb",
    "name": "Estadio Bernabéu",
    "shortName": "Estadio Bernabéu",
    "lat": 40.453068,
    "lon": -3.688354
  },
  "1tethtdduidjywarrz3qiyx3o": {
    "id": "81guly6ecfrnsu6pfs0qqb1ik",
    "name": "Estadio Ramón Sánchez Pizjuán",
    "shortName": "Estadio Ramón Sánchez Pizjuán",
    "lat": 37.384046,
    "lon": -5.970592
  },
  "1rvgcgz2ftmamcay54gz2qtjo": {
    "id": "46sq3vgaf79kjl0yd82jm3t5n",
    "name": "RCDE Stadium",
    "shortName": "RCDE Stadium",
    "lat": 41.34786,
    "lon": 2.075622
  },
  "1uit2aujexe8xc2izg1a2uyvo": {
    "id": "4rog35zkswi1nymg8o55ppiag",
    "name": "Estadio Manuel Martínez Valero",
    "shortName": "Estadio Manuel Martínez Valero",
    "lat": 38.267129,
    "lon": -0.6633
  },
  "1r4k8mooxohtqr7vzjm29hul0": {
    "id": "23fwsofybpbwfcxjrysy6on19",
    "name": "Estadio El Sadar",
    "shortName": "Estadio El Sadar",
    "lat": 42.796677,
    "lon": -1.637141
  },
  "1u5e5gvy0cadt3stkrffvi8es": {
    "id": "8z6nwwiy8h2kqq7z3yxf7aqti",
    "name": "Estadio Abanca-Balaídos",
    "shortName": "Estadio Abanca-Balaídos",
    "lat": 42.211852,
    "lon": -8.739721
  },
  "1sm9e25y9tbcyvop5fmwgz8k4": {
    "id": "6wek5bab1al0qtnl6pjyntp42",
    "name": "Estadio de Vallecas",
    "shortName": "Estadio de Vallecas",
    "lat": 40.391823,
    "lon": -3.658589
  },
  "1pmmfccm8cfhw6hua3w0gz28k": {
    "id": "3tsyaiz1y1gg31xw81qgtrx4w",
    "name": "Estadio de San Mamés",
    "shortName": "Estadio de San Mamés",
    "lat": 43.264173,
    "lon": -2.949383
  },
  "1q09wu5t41r3rdtsv757pyf4k": {
    "id": "8igj49hbhu62z77bwtczd7zc5",
    "name": "Estadio La Cartuja de Sevilla",
    "shortName": "Estadio La Cartuja de Sevilla",
    "lat": 37.417209,
    "lon": -6.004661
  },
  "1qdreckuiubqc7yotymp8jggk": {
    "id": "4rog35zkswi1nymg8o55ppiag",
    "name": "Estadio Manuel Martínez Valero",
    "shortName": "Estadio Manuel Martínez Valero",
    "lat": 38.267129,
    "lon": -0.6633
  },
  "1oi5jmg0ldrmljyz46todfbpw": {
    "id": "d9i7k0es5x4ccxcapt1fcg9c2",
    "name": "Estadio de la Cerámica",
    "shortName": "Estadio de la Cerámica",
    "lat": 39.944119,
    "lon": -0.103474
  },
  "1o35rsofsxiepozlbmke0wduc": {
    "id": "3y2qrs9lma04q7tntobgey3s8",
    "name": "Estadi Municipal de Montilivi",
    "shortName": "Estadi Municipal de Montilivi",
    "lat": 41.961195,
    "lon": 2.828495
  },
  "1nc8632r4hii9bl1ygnappkpg": {
    "id": "7o6sbdki1c1b3f54ga3xj5abb",
    "name": "Estadio Bernabéu",
    "shortName": "Estadio Bernabéu",
    "lat": 40.453068,
    "lon": -3.688354
  },
  "1nppp2u47kuc6os6g0e21xp1w": {
    "id": "23fwsofybpbwfcxjrysy6on19",
    "name": "Estadio El Sadar",
    "shortName": "Estadio El Sadar",
    "lat": 42.796677,
    "lon": -1.637141
  },
  "1qr5wncwgktkt7jksvs6m3n6c": {
    "id": "2n6pw21w4t9kc955w78ryjkyr",
    "name": "Estadio Ciudad de Valencia",
    "shortName": "Estadio Ciudad de Valencia",
    "lat": 39.494686,
    "lon": -0.36382
  },
  "1ovhxl8n5vxmkrovkcg8q8ufo": {
    "id": "1i6aurveqizhdsg4bgdhprlom",
    "name": "Estadio Municipal Carlos Tartiere",
    "shortName": "Estadio Municipal Carlos Tartiere",
    "lat": 43.360762,
    "lon": -5.870261
  },
  "1p93rklxg8b0b4dymsqjlcbh0": {
    "id": "8ell9vv21ntqufsr5a4qyvjlg",
    "name": "Estadio de Mestalla",
    "shortName": "Estadio de Mestalla",
    "lat": 39.474602,
    "lon": -0.358257
  },
  "1kcl2n7fay0ptltdwj2k47tp0": {
    "id": "6wek5bab1al0qtnl6pjyntp42",
    "name": "Estadio de Vallecas",
    "shortName": "Estadio de Vallecas",
    "lat": 40.391823,
    "lon": -3.658589
  },
  "1m7vig0k2tt5q9apse7108pas": {
    "id": "26ycul6lcermwam7oxr57qyny",
    "name": "Estadio de Mendizorroza",
    "shortName": "Estadio de Mendizorroza",
    "lat": 42.837076,
    "lon": -2.688247
  },
  "1jz2ik6i4oz41zqr2od8yiwb8": {
    "id": "8z6nwwiy8h2kqq7z3yxf7aqti",
    "name": "Estadio Abanca-Balaídos",
    "shortName": "Estadio Abanca-Balaídos",
    "lat": 42.211852,
    "lon": -8.739721
  },
  "1lud5oppwm3ngiyzarvb1zoyc": {
    "id": "81guly6ecfrnsu6pfs0qqb1ik",
    "name": "Estadio Ramón Sánchez Pizjuán",
    "shortName": "Estadio Ramón Sánchez Pizjuán",
    "lat": 37.384046,
    "lon": -5.970592
  },
  "1l3ezfcz5pfa7eixz6hnfmj9w": {
    "id": "4ydszy39adhtczo02as8gdqup",
    "name": "Estadio Coliseum",
    "shortName": "Estadio Coliseum",
    "lat": 40.325729,
    "lon": -3.714964
  },
  "1myp00g7w796yt6ts8ojdkys4": {
    "id": "8jpaixac05v4tl6wyhwk2drdy",
    "name": "Spotify Camp Nou",
    "shortName": "Spotify Camp Nou",
    "lat": 41.38089,
    "lon": 2.122813
  },
  "1kpzn7hqfuvbxrrrsh2c6mdxw": {
    "id": "awbbogt2i6macegd87pre8044",
    "name": "Estadi Mallorca Son Moix",
    "shortName": "Estadi Mallorca Son Moix",
    "lat": 39.58994,
    "lon": 2.630078
  },
  "1mlai6ycmblrejdaxysomfw2c": {
    "id": "4dki5bxv1ttz1c9vkeifguc45",
    "name": "Riyadh Air Metropolitano",
    "shortName": "Riyadh Air Metropolitano",
    "lat": 40.436226,
    "lon": -3.59946
  },
  "1lgsuqoyjxec8b0tdfgdpl15g": {
    "id": "bpfd0sk353ozrgi4jrjs5qgqs",
    "name": "Estadio Municipal de Anoeta",
    "shortName": "Estadio Municipal de Anoeta",
    "lat": 43.301376,
    "lon": -1.973602
  },
  "1hp0gvnq8tu7bswk405xa49as": {
    "id": "23fwsofybpbwfcxjrysy6on19",
    "name": "Estadio El Sadar",
    "shortName": "Estadio El Sadar",
    "lat": 42.796677,
    "lon": -1.637141
  },
  "1gy4rm1nw9jppuagj17r91l3o": {
    "id": "7o6sbdki1c1b3f54ga3xj5abb",
    "name": "Estadio Bernabéu",
    "shortName": "Estadio Bernabéu",
    "lat": 40.453068,
    "lon": -3.688354
  },
  "1g7ev92a4xzvmnte18e1h7thw": {
    "id": "46sq3vgaf79kjl0yd82jm3t5n",
    "name": "RCDE Stadium",
    "shortName": "RCDE Stadium",
    "lat": 41.34786,
    "lon": 2.075622
  },
  "1ifuis5x6296qke087rpwo5jo": {
    "id": "8ell9vv21ntqufsr5a4qyvjlg",
    "name": "Estadio de Mestalla",
    "shortName": "Estadio de Mestalla",
    "lat": 39.474602,
    "lon": -0.358257
  },
  "1fu4ltpxdb9j94v6s2kbx1puc": {
    "id": "4rog35zkswi1nymg8o55ppiag",
    "name": "Estadio Manuel Martínez Valero",
    "shortName": "Estadio Manuel Martínez Valero",
    "lat": 38.267129,
    "lon": -0.6633
  },
  "1j6l9nsawkrpvmlpb5fprga38": {
    "id": "3tsyaiz1y1gg31xw81qgtrx4w",
    "name": "Estadio de San Mamés",
    "shortName": "Estadio de San Mamés",
    "lat": 43.264173,
    "lon": -2.949383
  },
  "1gkqfp2d7qi9h6k34k3mo8zkk": {
    "id": "8igj49hbhu62z77bwtczd7zc5",
    "name": "Estadio La Cartuja de Sevilla",
    "shortName": "Estadio La Cartuja de Sevilla",
    "lat": 37.417209,
    "lon": -6.004661
  },
  "1it612xdkwgzafk6n7xtzy8es": {
    "id": "26ycul6lcermwam7oxr57qyny",
    "name": "Estadio de Mendizorroza",
    "shortName": "Estadio de Mendizorroza",
    "lat": 42.837076,
    "lon": -2.688247
  },
  "1hbkc2pl94wmoej46f3izy4gk": {
    "id": "d9i7k0es5x4ccxcapt1fcg9c2",
    "name": "Estadio de la Cerámica",
    "shortName": "Estadio de la Cerámica",
    "lat": 39.944119,
    "lon": -0.103474
  },
  "1i2f9ycdq0mof2nmr7jievlsk": {
    "id": "1i6aurveqizhdsg4bgdhprlom",
    "name": "Estadio Municipal Carlos Tartiere",
    "shortName": "Estadio Municipal Carlos Tartiere",
    "lat": 43.360762,
    "lon": -5.870261
  },
  "1ximrnsi0rfciohtjk242p1jo": {
    "id": "3tsyaiz1y1gg31xw81qgtrx4w",
    "name": "Estadio de San Mamés",
    "shortName": "Estadio de San Mamés",
    "lat": 43.264173,
    "lon": -2.949383
  },
  "1v9qqviahmnia4ewmzd4aejv8": {
    "id": "8jpaixac05v4tl6wyhwk2drdy",
    "name": "Spotify Camp Nou",
    "shortName": "Spotify Camp Nou",
    "lat": 41.38089,
    "lon": 2.122813
  },
  "1ctejm87t066zop4ert2zb4es": {
    "id": "6wek5bab1al0qtnl6pjyntp42",
    "name": "Estadio de Vallecas",
    "shortName": "Estadio de Vallecas",
    "lat": 40.391823,
    "lon": -3.658589
  },
  "1c2s2pxxqc6pp652crmn64etw": {
    "id": "3y2qrs9lma04q7tntobgey3s8",
    "name": "Estadi Municipal de Montilivi",
    "shortName": "Estadi Municipal de Montilivi",
    "lat": 41.961195,
    "lon": 2.828495
  },
  "1fgucgxqx7rp34edgxippj6s4": {
    "id": "8z6nwwiy8h2kqq7z3yxf7aqti",
    "name": "Estadio Abanca-Balaídos",
    "shortName": "Estadio Abanca-Balaídos",
    "lat": 42.211852,
    "lon": -8.739721
  },
  "1eaz7mdny12eiuyeysnycnw2c": {
    "id": "81guly6ecfrnsu6pfs0qqb1ik",
    "name": "Estadio Ramón Sánchez Pizjuán",
    "shortName": "Estadio Ramón Sánchez Pizjuán",
    "lat": 37.384046,
    "lon": -5.970592
  },
  "1d6oxum3q5ydyzsf48df1qas4": {
    "id": "bpfd0sk353ozrgi4jrjs5qgqs",
    "name": "Estadio Municipal de Anoeta",
    "shortName": "Estadio Municipal de Anoeta",
    "lat": 43.301376,
    "lon": -1.973602
  },
  "1f3hreqlw5s8sg03041v1ecyc": {
    "id": "4dki5bxv1ttz1c9vkeifguc45",
    "name": "Riyadh Air Metropolitano",
    "shortName": "Riyadh Air Metropolitano",
    "lat": 40.436226,
    "lon": -3.59946
  },
  "1dxl0z31i0438ti5nrd22dl3o": {
    "id": "2n6pw21w4t9kc955w78ryjkyr",
    "name": "Estadio Ciudad de Valencia",
    "shortName": "Estadio Ciudad de Valencia",
    "lat": 39.494686,
    "lon": -0.36382
  },
  "1dk2hnl09qux7z4fqn1qxq238": {
    "id": "8jpaixac05v4tl6wyhwk2drdy",
    "name": "Spotify Camp Nou",
    "shortName": "Spotify Camp Nou",
    "lat": 41.38089,
    "lon": 2.122813
  },
  "1cg5aiu7phyw89gyr0m9hme50": {
    "id": "awbbogt2i6macegd87pre8044",
    "name": "Estadi Mallorca Son Moix",
    "shortName": "Estadi Mallorca Son Moix",
    "lat": 39.58994,
    "lon": 2.630078
  },
  "1eq00zu9dngz36evkyw20uw44": {
    "id": "4ydszy39adhtczo02as8gdqup",
    "name": "Estadio Coliseum",
    "shortName": "Estadio Coliseum",
    "lat": 40.325729,
    "lon": -3.714964
  },
  "191yv3mlrk964ybeg2ilya9sk": {
    "id": "46sq3vgaf79kjl0yd82jm3t5n",
    "name": "RCDE Stadium",
    "shortName": "RCDE Stadium",
    "lat": 41.34786,
    "lon": 2.075622
  },
  "18ojlro5jtdeu8nv72repur6c": {
    "id": "4rog35zkswi1nymg8o55ppiag",
    "name": "Estadio Manuel Martínez Valero",
    "shortName": "Estadio Manuel Martínez Valero",
    "lat": 38.267129,
    "lon": -0.6633
  },
  "1al4jq2l4mkefxzf7iqmiledw": {
    "id": "4ydszy39adhtczo02as8gdqup",
    "name": "Estadio Coliseum",
    "shortName": "Estadio Coliseum",
    "lat": 40.325729,
    "lon": -3.714964
  },
  "18b3vyjp3y356x49ce7z1qdxw": {
    "id": "8igj49hbhu62z77bwtczd7zc5",
    "name": "Estadio La Cartuja de Sevilla",
    "shortName": "Estadio La Cartuja de Sevilla",
    "lat": 37.417209,
    "lon": -6.004661
  },
  "19ubgm1lxlw64hrajkv1cc5ck": {
    "id": "1i6aurveqizhdsg4bgdhprlom",
    "name": "Estadio Municipal Carlos Tartiere",
    "shortName": "Estadio Municipal Carlos Tartiere",
    "lat": 43.360762,
    "lon": -5.870261
  },
  "1bbwtdnimi7tbl6aatezlnwno": {
    "id": "d9i7k0es5x4ccxcapt1fcg9c2",
    "name": "Estadio de la Cerámica",
    "shortName": "Estadio de la Cerámica",
    "lat": 39.944119,
    "lon": -0.103474
  },
  "19fc4xa7cho23jve43ojie39w": {
    "id": "23fwsofybpbwfcxjrysy6on19",
    "name": "Estadio El Sadar",
    "shortName": "Estadio El Sadar",
    "lat": 42.796677,
    "lon": -1.637141
  },
  "1a7radhhole7vfnciarzauq6s": {
    "id": "8jpaixac05v4tl6wyhwk2drdy",
    "name": "Spotify Camp Nou",
    "shortName": "Spotify Camp Nou",
    "lat": 41.38089,
    "lon": 2.122813
  },
  "1bpdzkqykdmb75z4uarby311w": {
    "id": "26ycul6lcermwam7oxr57qyny",
    "name": "Estadio de Mendizorroza",
    "shortName": "Estadio de Mendizorroza",
    "lat": 42.837076,
    "lon": -2.688247
  },
  "1ayj7qyruvkyprfzr6plov4t0": {
    "id": "8ell9vv21ntqufsr5a4qyvjlg",
    "name": "Estadio de Mestalla",
    "shortName": "Estadio de Mestalla",
    "lat": 39.474602,
    "lon": -0.358257
  },
  "16t0fdut4ky4b4es7i0trovtg": {
    "id": "8z6nwwiy8h2kqq7z3yxf7aqti",
    "name": "Estadio Abanca-Balaídos",
    "shortName": "Estadio Abanca-Balaídos",
    "lat": 42.211852,
    "lon": -8.739721
  },
  "17kbnro1phdt3xdaadluy52j8": {
    "id": "awbbogt2i6macegd87pre8044",
    "name": "Estadi Mallorca Son Moix",
    "shortName": "Estadi Mallorca Son Moix",
    "lat": 39.58994,
    "lon": 2.630078
  },
  "176p8ms7mmtnsyiwqb87aavx0": {
    "id": "8ell9vv21ntqufsr5a4qyvjlg",
    "name": "Estadio de Mestalla",
    "shortName": "Estadio de Mestalla",
    "lat": 39.474602,
    "lon": -0.358257
  },
  "16234pc0mx6bpyeqhj4i81p90": {
    "id": "6wek5bab1al0qtnl6pjyntp42",
    "name": "Estadio de Vallecas",
    "shortName": "Estadio de Vallecas",
    "lat": 40.391823,
    "lon": -3.658589
  },
  "14ia91hr21lnjto1f2uga5f6c": {
    "id": "3tsyaiz1y1gg31xw81qgtrx4w",
    "name": "Estadio de San Mamés",
    "shortName": "Estadio de San Mamés",
    "lat": 43.264173,
    "lon": -2.949383
  },
  "15ojns8pjndvlncxp05js2cyc": {
    "id": "46sq3vgaf79kjl0yd82jm3t5n",
    "name": "RCDE Stadium",
    "shortName": "RCDE Stadium",
    "lat": 41.34786,
    "lon": 2.075622
  },
  "14xa2ysiarbslbwcla4hhzqj8": {
    "id": "4dki5bxv1ttz1c9vkeifguc45",
    "name": "Riyadh Air Metropolitano",
    "shortName": "Riyadh Air Metropolitano",
    "lat": 40.436226,
    "lon": -3.59946
  },
  "17xoblao6gdkidisaddnrpa1g": {
    "id": "81guly6ecfrnsu6pfs0qqb1ik",
    "name": "Estadio Ramón Sánchez Pizjuán",
    "shortName": "Estadio Ramón Sánchez Pizjuán",
    "lat": 37.384046,
    "lon": -5.970592
  },
  "16fj9cb2vp81vtnlvqdcoou1g": {
    "id": "3y2qrs9lma04q7tntobgey3s8",
    "name": "Estadi Municipal de Montilivi",
    "shortName": "Estadi Municipal de Montilivi",
    "lat": 41.961195,
    "lon": 2.828495
  },
  "15au35re7u5b9ru4hoko7f3f8": {
    "id": "4rog35zkswi1nymg8o55ppiag",
    "name": "Estadio Manuel Martínez Valero",
    "shortName": "Estadio Manuel Martínez Valero",
    "lat": 38.267129,
    "lon": -0.6633
  },
  "13d50vdn5ecuddcpg1cvdrq50": {
    "id": "1i6aurveqizhdsg4bgdhprlom",
    "name": "Estadio Municipal Carlos Tartiere",
    "shortName": "Estadio Municipal Carlos Tartiere",
    "lat": 43.360762,
    "lon": -5.870261
  },
  "11hplskmrac4dwfmqv72f9nh0": {
    "id": "8igj49hbhu62z77bwtczd7zc5",
    "name": "Estadio La Cartuja de Sevilla",
    "shortName": "Estadio La Cartuja de Sevilla",
    "lat": 37.417209,
    "lon": -6.004661
  },
  "113wccwt50kebz0thqf0fxkpg": {
    "id": "3ahxyb4q6fwsr6woc83qp7hed",
    "name": "Estadi Olímpic Lluís Companys",
    "shortName": "Estadi Olímpic Lluís Companys",
    "lat": 41.364756,
    "lon": 2.155573
  },
  "144g7b7ez101gt3yczm0yblzo": {
    "id": "26ycul6lcermwam7oxr57qyny",
    "name": "Estadio de Mendizorroza",
    "shortName": "Estadio de Mendizorroza",
    "lat": 42.837076,
    "lon": -2.688247
  },
  "12zi2fz6nuyhye00alaymbms4": {
    "id": "2n6pw21w4t9kc955w78ryjkyr",
    "name": "Estadio Ciudad de Valencia",
    "shortName": "Estadio Ciudad de Valencia",
    "lat": 39.494686,
    "lon": -0.36382
  },
  "1288ajju0cadnuxxhvkal1mok": {
    "id": "7o6sbdki1c1b3f54ga3xj5abb",
    "name": "Estadio Bernabéu",
    "shortName": "Estadio Bernabéu",
    "lat": 40.453068,
    "lon": -3.688354
  },
  "12lophscpllg367yx7yn0mpec": {
    "id": "bpfd0sk353ozrgi4jrjs5qgqs",
    "name": "Estadio Municipal de Anoeta",
    "shortName": "Estadio Municipal de Anoeta",
    "lat": 43.301376,
    "lon": -1.973602
  },
  "10qg7chtpoj0knqnvx2oduot0": {
    "id": "4dki5bxv1ttz1c9vkeifguc45",
    "name": "Riyadh Air Metropolitano",
    "shortName": "Riyadh Air Metropolitano",
    "lat": 40.436226,
    "lon": -3.59946
  },
  "13qwzalezgy8gxih0ube0ap78": {
    "id": "d9i7k0es5x4ccxcapt1fcg9c2",
    "name": "Estadio de la Cerámica",
    "shortName": "Estadio de la Cerámica",
    "lat": 39.944119,
    "lon": -0.103474
  },
  "11uxeay5z2isuekqd9fq0usyc": {
    "id": "4ydszy39adhtczo02as8gdqup",
    "name": "Estadio Coliseum",
    "shortName": "Estadio Coliseum",
    "lat": 40.325729,
    "lon": -3.714964
  },
  "ygjm4bbtl6jbrz9gsd661vys": {
    "id": "8igj49hbhu62z77bwtczd7zc5",
    "name": "Estadio La Cartuja de Sevilla",
    "shortName": "Estadio La Cartuja de Sevilla",
    "lat": 37.417209,
    "lon": -6.004661
  },
  "y38fh1awgi9yuxppo1n61ous": {
    "id": "6wek5bab1al0qtnl6pjyntp42",
    "name": "Estadio de Vallecas",
    "shortName": "Estadio de Vallecas",
    "lat": 40.391823,
    "lon": -3.658589
  },
  "z7hbnyt9xc1j8x9pacy6jmdw": {
    "id": "23fwsofybpbwfcxjrysy6on19",
    "name": "Estadio El Sadar",
    "shortName": "Estadio El Sadar",
    "lat": 42.796677,
    "lon": -1.637141
  },
  "ytxz0i1eppxxqupm27ktuln8": {
    "id": "7o6sbdki1c1b3f54ga3xj5abb",
    "name": "Estadio Bernabéu",
    "shortName": "Estadio Bernabéu",
    "lat": 40.453068,
    "lon": -3.688354
  },
  "zzqopgn9iz38xxwmgsl6ccus": {
    "id": "awbbogt2i6macegd87pre8044",
    "name": "Estadi Mallorca Son Moix",
    "shortName": "Estadi Mallorca Son Moix",
    "lat": 39.58994,
    "lon": 2.630078
  },
  "xpp766lmrig4xeolfmmtehp0": {
    "id": "8ell9vv21ntqufsr5a4qyvjlg",
    "name": "Estadio de Mestalla",
    "shortName": "Estadio de Mestalla",
    "lat": 39.474602,
    "lon": -0.358257
  },
  "10d1132abu0fa9xolj05top3o": {
    "id": "3tsyaiz1y1gg31xw81qgtrx4w",
    "name": "Estadio de San Mamés",
    "shortName": "Estadio de San Mamés",
    "lat": 43.264173,
    "lon": -2.949383
  },
  "zkqu9lm76sa6ypjcluvnr578": {
    "id": "46sq3vgaf79kjl0yd82jm3t5n",
    "name": "RCDE Stadium",
    "shortName": "RCDE Stadium",
    "lat": 41.34786,
    "lon": 2.075622
  },
  "wyrlnmec1exr7tyktusq0i6s": {
    "id": "3y2qrs9lma04q7tntobgey3s8",
    "name": "Estadi Municipal de Montilivi",
    "shortName": "Estadi Municipal de Montilivi",
    "lat": 41.961195,
    "lon": 2.828495
  },
  "xcapf185ght9jj3jcgj4v0us": {
    "id": "bpfd0sk353ozrgi4jrjs5qgqs",
    "name": "Estadio Municipal de Anoeta",
    "shortName": "Estadio Municipal de Anoeta",
    "lat": 43.301376,
    "lon": -1.973602
  },
  "t6q5ftwcnm8os0cb3stk1kic": {
    "id": "26ycul6lcermwam7oxr57qyny",
    "name": "Estadio de Mendizorroza",
    "shortName": "Estadio de Mendizorroza",
    "lat": 42.837076,
    "lon": -2.688247
  },
  "uoe12e3coa1i9fov19pdukus": {
    "id": "4ydszy39adhtczo02as8gdqup",
    "name": "Estadio Coliseum",
    "shortName": "Estadio Coliseum",
    "lat": 40.325729,
    "lon": -3.714964
  },
  "v3lhpsc6pb8pl9l3mu0evqj8": {
    "id": "2n6pw21w4t9kc955w78ryjkyr",
    "name": "Estadio Ciudad de Valencia",
    "shortName": "Estadio Ciudad de Valencia",
    "lat": 39.494686,
    "lon": -0.36382
  },
  "ub49wftchgk7szozxswbslck": {
    "id": "8z6nwwiy8h2kqq7z3yxf7aqti",
    "name": "Estadio Abanca-Balaídos",
    "shortName": "Estadio Abanca-Balaídos",
    "lat": 42.211852,
    "lon": -8.739721
  },
  "vgz6kc0y9dz9ecnnqulzb578": {
    "id": "4rog35zkswi1nymg8o55ppiag",
    "name": "Estadio Manuel Martínez Valero",
    "shortName": "Estadio Manuel Martínez Valero",
    "lat": 38.267129,
    "lon": -0.6633
  },
  "tk5mkd96dh3cu38pb2k286qc": {
    "id": "4dki5bxv1ttz1c9vkeifguc45",
    "name": "Riyadh Air Metropolitano",
    "shortName": "Riyadh Air Metropolitano",
    "lat": 40.436226,
    "lon": -3.59946
  },
  "vue1zih02z58m1ihnz9pod90": {
    "id": "d9i7k0es5x4ccxcapt1fcg9c2",
    "name": "Estadio de la Cerámica",
    "shortName": "Estadio de la Cerámica",
    "lat": 39.944119,
    "lon": -0.103474
  },
  "txn45zihl3cp2bv3lj5rmot0": {
    "id": "3ahxyb4q6fwsr6woc83qp7hed",
    "name": "Estadi Olímpic Lluís Companys",
    "shortName": "Estadi Olímpic Lluís Companys",
    "lat": 41.364756,
    "lon": 2.155573
  },
  "wlegmdabr8ruispvl8gtzv9w": {
    "id": "81guly6ecfrnsu6pfs0qqb1ik",
    "name": "Estadio Ramón Sánchez Pizjuán",
    "shortName": "Estadio Ramón Sánchez Pizjuán",
    "lat": 37.384046,
    "lon": -5.970592
  },
  "w7ym83i7x7vql3mkid0zn3tg": {
    "id": "1i6aurveqizhdsg4bgdhprlom",
    "name": "Estadio Municipal Carlos Tartiere",
    "shortName": "Estadio Municipal Carlos Tartiere",
    "lat": 43.360762,
    "lon": -5.870261
  },
  "qys0flp8cpyb6p1fsjh7d1xw": {
    "id": "8z6nwwiy8h2kqq7z3yxf7aqti",
    "name": "Estadio Abanca-Balaídos",
    "shortName": "Estadio Abanca-Balaídos",
    "lat": 42.211852,
    "lon": -8.739721
  },
  "stfu1ncpwokjdp38odv9rb4k": {
    "id": "bpfd0sk353ozrgi4jrjs5qgqs",
    "name": "Estadio Municipal de Anoeta",
    "shortName": "Estadio Municipal de Anoeta",
    "lat": 43.301376,
    "lon": -1.973602
  },
  "rp9h3yrxylg9bwywpccje8lw": {
    "id": "46sq3vgaf79kjl0yd82jm3t5n",
    "name": "RCDE Stadium",
    "shortName": "RCDE Stadium",
    "lat": 41.34786,
    "lon": 2.075622
  },
  "rbyhgw1kyp0ghg2qpvznvvv8": {
    "id": "81guly6ecfrnsu6pfs0qqb1ik",
    "name": "Estadio Ramón Sánchez Pizjuán",
    "shortName": "Estadio Ramón Sánchez Pizjuán",
    "lat": 37.384046,
    "lon": -5.970592
  },
  "pftv5ujrolgrr85ijlnj728k": {
    "id": "26ycul6lcermwam7oxr57qyny",
    "name": "Estadio de Mendizorroza",
    "shortName": "Estadio de Mendizorroza",
    "lat": 42.837076,
    "lon": -2.688247
  },
  "qll7e8qbbmjfzxvwpi96cg0k": {
    "id": "7o6sbdki1c1b3f54ga3xj5abb",
    "name": "Estadio Bernabéu",
    "shortName": "Estadio Bernabéu",
    "lat": 40.453068,
    "lon": -3.688354
  },
  "pt81qdbd7pkbnnkpq246rtw4": {
    "id": "3tsyaiz1y1gg31xw81qgtrx4w",
    "name": "Estadio de San Mamés",
    "shortName": "Estadio de San Mamés",
    "lat": 43.264173,
    "lon": -2.949383
  },
  "q89ix5d2x25rptwlhkq27j10": {
    "id": "3y2qrs9lma04q7tntobgey3s8",
    "name": "Estadi Municipal de Montilivi",
    "shortName": "Estadi Municipal de Montilivi",
    "lat": 41.961195,
    "lon": 2.828495
  },
  "sg2ifrolnrbubiys9n9n8844": {
    "id": "1i6aurveqizhdsg4bgdhprlom",
    "name": "Estadio Municipal Carlos Tartiere",
    "shortName": "Estadio Municipal Carlos Tartiere",
    "lat": 43.360762,
    "lon": -5.870261
  },
  "s2odkp4oybdaqou9lx1fd6ok": {
    "id": "23fwsofybpbwfcxjrysy6on19",
    "name": "Estadio El Sadar",
    "shortName": "Estadio El Sadar",
    "lat": 42.796677,
    "lon": -1.637141
  },
  "lqdgf26mjssi4yz9o00xco44": {
    "id": "8ell9vv21ntqufsr5a4qyvjlg",
    "name": "Estadio de Mestalla",
    "shortName": "Estadio de Mestalla",
    "lat": 39.474602,
    "lon": -0.358257
  },
  "mulhl7s94em1faqw5y2499uc": {
    "id": "8igj49hbhu62z77bwtczd7zc5",
    "name": "Estadio La Cartuja de Sevilla",
    "shortName": "Estadio La Cartuja de Sevilla",
    "lat": 37.417209,
    "lon": -6.004661
  },
  "mh9g8wbjyoe3ub3ouu0nnsb8": {
    "id": "3ahxyb4q6fwsr6woc83qp7hed",
    "name": "Estadi Olímpic Lluís Companys",
    "shortName": "Estadi Olímpic Lluís Companys",
    "lat": 41.364756,
    "lon": 2.155573
  },
  "opadvx9ieaoaai2n08r4sqok": {
    "id": "4rog35zkswi1nymg8o55ppiag",
    "name": "Estadio Manuel Martínez Valero",
    "shortName": "Estadio Manuel Martínez Valero",
    "lat": 38.267129,
    "lon": -0.6633
  },
  "nl5iakd17ewjayh3ah21iolw": {
    "id": "6wek5bab1al0qtnl6pjyntp42",
    "name": "Estadio de Vallecas",
    "shortName": "Estadio de Vallecas",
    "lat": 40.391823,
    "lon": -3.658589
  },
  "obyek5fw1lg9l72jn8omr4lw": {
    "id": "d9i7k0es5x4ccxcapt1fcg9c2",
    "name": "Estadio de la Cerámica",
    "shortName": "Estadio de la Cerámica",
    "lat": 39.944119,
    "lon": -0.103474
  },
  "nyhzbo7wncd07zhc7pysjris": {
    "id": "awbbogt2i6macegd87pre8044",
    "name": "Estadi Mallorca Son Moix",
    "shortName": "Estadi Mallorca Son Moix",
    "lat": 39.58994,
    "lon": 2.630078
  },
  "m3rr5kwhsu6s770ey69xad5g": {
    "id": "4dki5bxv1ttz1c9vkeifguc45",
    "name": "Riyadh Air Metropolitano",
    "shortName": "Riyadh Air Metropolitano",
    "lat": 40.436226,
    "lon": -3.59946
  },
  "n7tx1yzdm3jcvtma21rf6al0": {
    "id": "4ydszy39adhtczo02as8gdqup",
    "name": "Estadio Coliseum",
    "shortName": "Estadio Coliseum",
    "lat": 40.325729,
    "lon": -3.714964
  },
  "p2nr5z25p9svx0ssxbjiprmc": {
    "id": "3y2qrs9lma04q7tntobgey3s8",
    "name": "Estadi Municipal de Montilivi",
    "shortName": "Estadi Municipal de Montilivi",
    "lat": 41.961195,
    "lon": 2.828495
  },
  "kkl8x55qltpl4g1v5260df6c": {
    "id": "1i6aurveqizhdsg4bgdhprlom",
    "name": "Estadio Municipal Carlos Tartiere",
    "shortName": "Estadio Municipal Carlos Tartiere",
    "lat": 43.360762,
    "lon": -5.870261
  },
  "lcqefumn96v640d0yzsv7xuc": {
    "id": "23fwsofybpbwfcxjrysy6on19",
    "name": "Estadio El Sadar",
    "shortName": "Estadio El Sadar",
    "lat": 42.796677,
    "lon": -1.637141
  },
  "ioo3djrnoe5kcc2n7mypzbis": {
    "id": "4dki5bxv1ttz1c9vkeifguc45",
    "name": "Riyadh Air Metropolitano",
    "shortName": "Riyadh Air Metropolitano",
    "lat": 40.436226,
    "lon": -3.59946
  },
  "hxr2ojynmpps6ni1gbdsa1hw": {
    "id": "bpfd0sk353ozrgi4jrjs5qgqs",
    "name": "Estadio Municipal de Anoeta",
    "shortName": "Estadio Municipal de Anoeta",
    "lat": 43.301376,
    "lon": -1.973602
  },
  "k7c27bcujfnarux79y4ike1g": {
    "id": "4ydszy39adhtczo02as8gdqup",
    "name": "Estadio Coliseum",
    "shortName": "Estadio Coliseum",
    "lat": 40.325729,
    "lon": -3.714964
  },
  "jtywnxc2k08euwiq1ssvws9g": {
    "id": "81guly6ecfrnsu6pfs0qqb1ik",
    "name": "Estadio Ramón Sánchez Pizjuán",
    "shortName": "Estadio Ramón Sánchez Pizjuán",
    "lat": 37.384046,
    "lon": -5.970592
  },
  "jfjnqx2yal5t4pcccve1zg9g": {
    "id": "2n6pw21w4t9kc955w78ryjkyr",
    "name": "Estadio Ciudad de Valencia",
    "shortName": "Estadio Ciudad de Valencia",
    "lat": 39.494686,
    "lon": -0.36382
  },
  "j23bvmu4uuofecr7aaeurtw4": {
    "id": "46sq3vgaf79kjl0yd82jm3t5n",
    "name": "RCDE Stadium",
    "shortName": "RCDE Stadium",
    "lat": 41.34786,
    "lon": 2.075622
  },
  "ib901b3xp60cmvf9jmlupqtw": {
    "id": "3tsyaiz1y1gg31xw81qgtrx4w",
    "name": "Estadio de San Mamés",
    "shortName": "Estadio de San Mamés",
    "lat": 43.264173,
    "lon": -2.949383
  },
  "ekk0usjk6blgzpziu4ho01zo": {
    "id": "d4mxwtnfc0gjvbteztnkhn0bu",
    "name": "Estadi Johan Cruyff",
    "shortName": "Estadi Johan Cruyff",
    "lat": 41.37422,
    "lon": 2.050604
  },
  "faxb5rfdawpnwaoof1j1o3ro": {
    "id": "4rog35zkswi1nymg8o55ppiag",
    "name": "Estadio Manuel Martínez Valero",
    "shortName": "Estadio Manuel Martínez Valero",
    "lat": 38.267129,
    "lon": -0.6633
  },
  "gg5bnkuq3inqnecavarjo3dg": {
    "id": "awbbogt2i6macegd87pre8044",
    "name": "Estadi Mallorca Son Moix",
    "shortName": "Estadi Mallorca Son Moix",
    "lat": 39.58994,
    "lon": 2.630078
  },
  "gtd7x0ncbf0phimiwpbxso44": {
    "id": "6wek5bab1al0qtnl6pjyntp42",
    "name": "Estadio de Vallecas",
    "shortName": "Estadio de Vallecas",
    "lat": 40.391823,
    "lon": -3.658589
  },
  "g1dat3xp3jfi5wvyc0njidxw": {
    "id": "8ell9vv21ntqufsr5a4qyvjlg",
    "name": "Estadio de Mestalla",
    "shortName": "Estadio de Mestalla",
    "lat": 39.474602,
    "lon": -0.358257
  },
  "hkc1gww0pz1b950ulnh6lnv8": {
    "id": "d9i7k0es5x4ccxcapt1fcg9c2",
    "name": "Estadio de la Cerámica",
    "shortName": "Estadio de la Cerámica",
    "lat": 39.944119,
    "lon": -0.103474
  },
  "e7g814p4n7r5gtpdqewz89p0": {
    "id": "26ycul6lcermwam7oxr57qyny",
    "name": "Estadio de Mendizorroza",
    "shortName": "Estadio de Mendizorroza",
    "lat": 42.837076,
    "lon": -2.688247
  },
  "h6rpuztodqc4wokrpyck2zv8": {
    "id": "7o6sbdki1c1b3f54ga3xj5abb",
    "name": "Estadio Bernabéu",
    "shortName": "Estadio Bernabéu",
    "lat": 40.453068,
    "lon": -3.688354
  },
  "fo7f0yq3c06q4hrw7vamnnro": {
    "id": "3y2qrs9lma04q7tntobgey3s8",
    "name": "Estadi Municipal de Montilivi",
    "shortName": "Estadi Municipal de Montilivi",
    "lat": 41.961195,
    "lon": 2.828495
  },
  "exqzwxpls360bd9qf89ggff8": {
    "id": "8igj49hbhu62z77bwtczd7zc5",
    "name": "Estadio La Cartuja de Sevilla",
    "shortName": "Estadio La Cartuja de Sevilla",
    "lat": 37.417209,
    "lon": -6.004661
  },
  "c0ed2ycw3cur2spz99c0r2ms": {
    "id": "46sq3vgaf79kjl0yd82jm3t5n",
    "name": "RCDE Stadium",
    "shortName": "RCDE Stadium",
    "lat": 41.34786,
    "lon": 2.075622
  },
  "b88u5e429cnb6ng0i5t4f9jo": {
    "id": "d4mxwtnfc0gjvbteztnkhn0bu",
    "name": "Estadi Johan Cruyff",
    "shortName": "Estadi Johan Cruyff",
    "lat": 41.37422,
    "lon": 2.050604
  },
  "cqquj1075tqrewhxjjliqrys": {
    "id": "23fwsofybpbwfcxjrysy6on19",
    "name": "Estadio El Sadar",
    "shortName": "Estadio El Sadar",
    "lat": 42.796677,
    "lon": -1.637141
  },
  "dh2jy2sqqln0u67dgau8p53o": {
    "id": "2n6pw21w4t9kc955w78ryjkyr",
    "name": "Estadio Ciudad de Valencia",
    "shortName": "Estadio Ciudad de Valencia",
    "lat": 39.494686,
    "lon": -0.36382
  },
  "bn4f12euztq92l1rq86faj2s": {
    "id": "8z6nwwiy8h2kqq7z3yxf7aqti",
    "name": "Estadio Abanca-Balaídos",
    "shortName": "Estadio Abanca-Balaídos",
    "lat": 42.211852,
    "lon": -8.739721
  },
  "av0qyy8sbq3jo28muv6smb6c": {
    "id": "4dki5bxv1ttz1c9vkeifguc45",
    "name": "Riyadh Air Metropolitano",
    "shortName": "Riyadh Air Metropolitano",
    "lat": 40.436226,
    "lon": -3.59946
  },
  "d3y8iv1iz7j4jz4loix4p9uc": {
    "id": "3tsyaiz1y1gg31xw81qgtrx4w",
    "name": "Estadio de San Mamés",
    "shortName": "Estadio de San Mamés",
    "lat": 43.264173,
    "lon": -2.949383
  },
  "ahwl5kztusj3oxv74lxw8pas": {
    "id": "bpfd0sk353ozrgi4jrjs5qgqs",
    "name": "Estadio Municipal de Anoeta",
    "shortName": "Estadio Municipal de Anoeta",
    "lat": 43.301376,
    "lon": -1.973602
  },
  "cdmj53c561vyvy44s5q32p04": {
    "id": "4ydszy39adhtczo02as8gdqup",
    "name": "Estadio Coliseum",
    "shortName": "Estadio Coliseum",
    "lat": 40.325729,
    "lon": -3.714964
  },
  "du8jha9qxukb7ki17m3y3aj8": {
    "id": "81guly6ecfrnsu6pfs0qqb1ik",
    "name": "Estadio Ramón Sánchez Pizjuán",
    "shortName": "Estadio Ramón Sánchez Pizjuán",
    "lat": 37.384046,
    "lon": -5.970592
  },
  "a4rapcrtfjbf1vihoi65rm6s": {
    "id": "6wek5bab1al0qtnl6pjyntp42",
    "name": "Estadio de Vallecas",
    "shortName": "Estadio de Vallecas",
    "lat": 40.391823,
    "lon": -3.658589
  },
  "8o8bord6whrdh4yaej7v766s": {
    "id": "46sq3vgaf79kjl0yd82jm3t5n",
    "name": "RCDE Stadium",
    "shortName": "RCDE Stadium",
    "lat": 41.34786,
    "lon": 2.075622
  },
  "9rnhp2t23qi248bbos0taxp0": {
    "id": "8igj49hbhu62z77bwtczd7zc5",
    "name": "Estadio La Cartuja de Sevilla",
    "shortName": "Estadio La Cartuja de Sevilla",
    "lat": 37.417209,
    "lon": -6.004661
  },
  "7xugcr8ngdrh3re1qvzjxnv8": {
    "id": "8z6nwwiy8h2kqq7z3yxf7aqti",
    "name": "Estadio Abanca-Balaídos",
    "shortName": "Estadio Abanca-Balaídos",
    "lat": 42.211852,
    "lon": -8.739721
  },
  "77rmbjidsouxav300f54behg": {
    "id": "7o6sbdki1c1b3f54ga3xj5abb",
    "name": "Estadio Bernabéu",
    "shortName": "Estadio Bernabéu",
    "lat": 40.453068,
    "lon": -3.688354
  },
  "91dd8ia3m0bxoqzjgyo3ptsk": {
    "id": "3y2qrs9lma04q7tntobgey3s8",
    "name": "Estadi Municipal de Montilivi",
    "shortName": "Estadi Municipal de Montilivi",
    "lat": 41.961195,
    "lon": 2.828495
  },
  "9eknjmjtkb8hdsde5htzqiac": {
    "id": "1i6aurveqizhdsg4bgdhprlom",
    "name": "Estadio Municipal Carlos Tartiere",
    "shortName": "Estadio Municipal Carlos Tartiere",
    "lat": 43.360762,
    "lon": -5.870261
  },
  "7kvwnpl7nq950703yan4bspg": {
    "id": "26ycul6lcermwam7oxr57qyny",
    "name": "Estadio de Mendizorroza",
    "shortName": "Estadio de Mendizorroza",
    "lat": 42.837076,
    "lon": -2.688247
  },
  "6uofyrgo5n51e1rbx8n8eeqc": {
    "id": "8ell9vv21ntqufsr5a4qyvjlg",
    "name": "Estadio de Mestalla",
    "shortName": "Estadio de Mestalla",
    "lat": 39.474602,
    "lon": -0.358257
  },
  "8auqwdd7rhk8k4erd29m5c0k": {
    "id": "4rog35zkswi1nymg8o55ppiag",
    "name": "Estadio Manuel Martínez Valero",
    "shortName": "Estadio Manuel Martínez Valero",
    "lat": 38.267129,
    "lon": -0.6633
  },
  "kxz64yu7ddap0d1agwdxugwk": {
    "id": "8z6nwwiy8h2kqq7z3yxf7aqti",
    "name": "Estadio Abanca-Balaídos",
    "shortName": "Estadio Abanca-Balaídos",
    "lat": 42.211852,
    "lon": -8.739721
  },
  "3677z72kaa3hckjtmi5qnb4k": {
    "id": "81guly6ecfrnsu6pfs0qqb1ik",
    "name": "Estadio Ramón Sánchez Pizjuán",
    "shortName": "Estadio Ramón Sánchez Pizjuán",
    "lat": 37.384046,
    "lon": -5.970592
  },
  "3wb1lwo6vq5hm78d7jllzd3o": {
    "id": "3tsyaiz1y1gg31xw81qgtrx4w",
    "name": "Estadio de San Mamés",
    "shortName": "Estadio de San Mamés",
    "lat": 43.264173,
    "lon": -2.949383
  },
  "4zhv5gr0aqfz7e8e32rrx6hg": {
    "id": "1i6aurveqizhdsg4bgdhprlom",
    "name": "Estadio Municipal Carlos Tartiere",
    "shortName": "Estadio Municipal Carlos Tartiere",
    "lat": 43.360762,
    "lon": -5.870261
  },
  "6g1tozuo8an9qds56u85juhg": {
    "id": "bpfd0sk353ozrgi4jrjs5qgqs",
    "name": "Estadio Municipal de Anoeta",
    "shortName": "Estadio Municipal de Anoeta",
    "lat": 43.301376,
    "lon": -1.973602
  },
  "3j6gjjg197ssn0pvnyq37itw": {
    "id": "d9i7k0es5x4ccxcapt1fcg9c2",
    "name": "Estadio de la Cerámica",
    "shortName": "Estadio de la Cerámica",
    "lat": 39.944119,
    "lon": -0.103474
  },
  "4mfxv5abl2kcamp8edxmwzkk": {
    "id": "23fwsofybpbwfcxjrysy6on19",
    "name": "Estadio El Sadar",
    "shortName": "Estadio El Sadar",
    "lat": 42.796677,
    "lon": -1.637141
  },
  "5pp18hcr9ery2hv17q7q6eqc": {
    "id": "2n6pw21w4t9kc955w78ryjkyr",
    "name": "Estadio Ciudad de Valencia",
    "shortName": "Estadio Ciudad de Valencia",
    "lat": 39.494686,
    "lon": -0.36382
  },
  "49e80e647ljijc5bz8tqc2l0": {
    "id": "4dki5bxv1ttz1c9vkeifguc45",
    "name": "Riyadh Air Metropolitano",
    "shortName": "Riyadh Air Metropolitano",
    "lat": 40.436226,
    "lon": -3.59946
  },
  "62wqjuo2ykej3fzagx0scs9g": {
    "id": "awbbogt2i6macegd87pre8044",
    "name": "Estadi Mallorca Son Moix",
    "shortName": "Estadi Mallorca Son Moix",
    "lat": 39.58994,
    "lon": 2.630078
  },
  "5chzep0qs16scjx4m95i8owk": {
    "id": "8igj49hbhu62z77bwtczd7zc5",
    "name": "Estadio La Cartuja de Sevilla",
    "shortName": "Estadio La Cartuja de Sevilla",
    "lat": 37.417209,
    "lon": -6.004661
  },
  "f46gwc0un9j7qzyfl4fpo6n10": {
    "id": "7o6sbdki1c1b3f54ga3xj5abb",
    "name": "Estadio Bernabéu",
    "shortName": "Estadio Bernabéu",
    "lat": 40.453068,
    "lon": -3.688354
  },
  "2t5f41usmgztitxkybrycidw": {
    "id": "4rog35zkswi1nymg8o55ppiag",
    "name": "Estadio Manuel Martínez Valero",
    "shortName": "Estadio Manuel Martínez Valero",
    "lat": 38.267129,
    "lon": -0.6633
  },
  "1wwdsnnj2m9ewz1d1mgt7y8k": {
    "id": "46sq3vgaf79kjl0yd82jm3t5n",
    "name": "RCDE Stadium",
    "shortName": "RCDE Stadium",
    "lat": 41.34786,
    "lon": 2.075622
  },
  "ine2hgzsb0qatru98nl045w": {
    "id": "3tsyaiz1y1gg31xw81qgtrx4w",
    "name": "Estadio de San Mamés",
    "shortName": "Estadio de San Mamés",
    "lat": 43.264173,
    "lon": -2.949383
  },
  "z0rmb36p9jp9acw2he9dgk4": {
    "id": "8z6nwwiy8h2kqq7z3yxf7aqti",
    "name": "Estadio Abanca-Balaídos",
    "shortName": "Estadio Abanca-Balaídos",
    "lat": 42.211852,
    "lon": -8.739721
  },
  "f4pxrt9gy35rbm5zxmjvxu5uc": {
    "id": "8ell9vv21ntqufsr5a4qyvjlg",
    "name": "Estadio de Mestalla",
    "shortName": "Estadio de Mestalla",
    "lat": 39.474602,
    "lon": -0.358257
  },
  "15ir6pt6au1v00gtef02v4k": {
    "id": "26ycul6lcermwam7oxr57qyny",
    "name": "Estadio de Mendizorroza",
    "shortName": "Estadio de Mendizorroza",
    "lat": 42.837076,
    "lon": -2.688247
  },
  "2d4xobwd1t1rd2kxlcjmqcyc": {
    "id": "awbbogt2i6macegd87pre8044",
    "name": "Estadi Mallorca Son Moix",
    "shortName": "Estadi Mallorca Son Moix",
    "lat": 39.58994,
    "lon": 2.630078
  },
  "f56qt74kmg9pbt0ci47030mqc": {
    "id": "d9i7k0es5x4ccxcapt1fcg9c2",
    "name": "Estadio de la Cerámica",
    "shortName": "Estadio de la Cerámica",
    "lat": 39.944119,
    "lon": -0.103474
  },
  "1f9e25njwyjk6ruheatqgglw": {
    "id": "3y2qrs9lma04q7tntobgey3s8",
    "name": "Estadi Municipal de Montilivi",
    "shortName": "Estadi Municipal de Montilivi",
    "lat": 41.961195,
    "lon": 2.828495
  },
  "8fkdhce1peguwgnsunwoln3f8": {
    "id": "1wuzt3ym8ch1pd9qbb1qw7dg2",
    "name": "Estadio Municipal José Zorrilla",
    "shortName": "Estadio Municipal José Zorrilla",
    "lat": 41.64458,
    "lon": -4.761264
  },
  "8gsasg1a8udin1qccgt1rk55g": {
    "id": "azf08zxtvr8njwk8gch6a5p97",
    "name": "Estadio Carlos Belmonte",
    "shortName": "Estadio Carlos Belmonte",
    "lat": 38.981146,
    "lon": -1.852114
  },
  "8e0buzpazvekslf9rgudkmgpg": {
    "id": "c6uztn87oaloqusnpi0dvwxsk",
    "name": "Estadi de la FAF d'Encamp",
    "shortName": "Estadi de la FAF d'Encamp",
    "lat": 42.533481,
    "lon": 1.575929
  },
  "8hxuhuhppv8ru74er798kjbpw": {
    "id": "7r0v5px7gqs90ak0n46oyg6vy",
    "name": "Estadio Abanca-Riazor",
    "shortName": "Estadio Abanca-Riazor",
    "lat": 43.36872,
    "lon": -8.41753
  },
  "72ps1vdo87zlm1ijk9fnyrcic": {
    "id": "3tsyaiz1y1gg31xw81qgtrx4w",
    "name": "Estadio de San Mamés",
    "shortName": "Estadio de San Mamés",
    "lat": 43.264173,
    "lon": -2.949383
  },
  "731909x80ix52l5w07taqsqac": {
    "id": "4dki5bxv1ttz1c9vkeifguc45",
    "name": "Riyadh Air Metropolitano",
    "shortName": "Riyadh Air Metropolitano",
    "lat": 40.436226,
    "lon": -3.59946
  },
  "8es4680yd87gtmomg2jk3isyc": {
    "id": "b6t5wrbem9m6yfm4btbwgs3h9",
    "name": "Estadio El Alcoraz",
    "shortName": "Estadio El Alcoraz",
    "lat": 42.131891,
    "lon": -0.424599
  },
  "6ypvv07mjqz0hg3voh3u7gges": {
    "id": "26ycul6lcermwam7oxr57qyny",
    "name": "Estadio de Mendizorroza",
    "shortName": "Estadio de Mendizorroza",
    "lat": 42.837076,
    "lon": -2.688247
  },
  "73csyv3hnitphnyv0z6vgt444": {
    "id": "8igj49hbhu62z77bwtczd7zc5",
    "name": "Estadio La Cartuja de Sevilla",
    "shortName": "Estadio La Cartuja de Sevilla",
    "lat": 37.417209,
    "lon": -6.004661
  },
  "70smcigm7ttqaz8fv6xsf87bo": {
    "id": "8jpaixac05v4tl6wyhwk2drdy",
    "name": "Spotify Camp Nou",
    "shortName": "Spotify Camp Nou",
    "lat": 41.38089,
    "lon": 2.122813
  },
  "8gcbai6m7v7o8piqfram4qe50": {
    "id": "akfuu0slee15x4lefqv139slc",
    "name": "Estadio Municipal El Molinón-Enrique Castro Quini",
    "shortName": "Estadio Municipal El Molinón-Enrique Castro Quini",
    "lat": 43.536284,
    "lon": -5.637397
  },
  "6zlh4hhvenk2hv5qtvk7xj0gk": {
    "id": "8z6nwwiy8h2kqq7z3yxf7aqti",
    "name": "Estadio Abanca-Balaídos",
    "shortName": "Estadio Abanca-Balaídos",
    "lat": 42.211852,
    "lon": -8.739721
  },
  "6z77qknhbwckkkciwzs085yj8": {
    "id": "4dki5bxv1ttz1c9vkeifguc45",
    "name": "Riyadh Air Metropolitano",
    "shortName": "Riyadh Air Metropolitano",
    "lat": 40.436226,
    "lon": -3.59946
  },
  "8hjyqksgwrgio75wqut9c5tsk": {
    "id": "6wftla6xnkf7wishleu0lizh",
    "name": "Estadio Nuevo Arcángel",
    "shortName": "Estadio Nuevo Arcángel",
    "lat": 37.872239,
    "lon": -4.764539
  },
  "8ee7ipt4u6kyk6baueedsdafo": {
    "id": "4erh6oe0fppxpuy8nc3jlv78h",
    "name": "Estadio Municipal Reino de León",
    "shortName": "Estadio Municipal Reino de León",
    "lat": 42.587397,
    "lon": -5.577064
  },
  "71l2f5qull2yzqxy409ojb2tw": {
    "id": "7o6sbdki1c1b3f54ga3xj5abb",
    "name": "Estadio Bernabéu",
    "shortName": "Estadio Bernabéu",
    "lat": 40.453068,
    "lon": -3.688354
  },
  "8jv8a1g0w3q9kvec2ksh1kdg4": {
    "id": "ajntng3bgkrny5s8tc69kuvhe",
    "name": "Campos de Sport de El Sardinero",
    "shortName": "Campos de Sport de El Sardinero",
    "lat": 43.476299,
    "lon": -3.793282
  },
  "7la6yuf9p9hw8nre121mkq1hw": {
    "id": "8ell9vv21ntqufsr5a4qyvjlg",
    "name": "Estadio de Mestalla",
    "shortName": "Estadio de Mestalla",
    "lat": 39.474602,
    "lon": -0.358257
  },
  "8jhducvwyfm3jz3fgkh49aiok": {
    "id": "87ugb3mvhk063nh378aaqmqep",
    "name": "Estadio Municipal Alfonso Murube",
    "shortName": "Estadio Municipal Alfonso Murube",
    "lat": 35.88546,
    "lon": -5.327945
  },
  "73ob0ein8likagvlqcyqf4zys": {
    "id": "4rog35zkswi1nymg8o55ppiag",
    "name": "Estadio Manuel Martínez Valero",
    "shortName": "Estadio Manuel Martínez Valero",
    "lat": 38.267129,
    "lon": -0.6633
  },
  "75lf3n4wfifs1thc01rv7lvkk": {
    "id": "8ell9vv21ntqufsr5a4qyvjlg",
    "name": "Estadio de Mestalla",
    "shortName": "Estadio de Mestalla",
    "lat": 39.474602,
    "lon": -0.358257
  },
  "71zqp0xwkbtm50t332jrwt0yc": {
    "id": "81guly6ecfrnsu6pfs0qqb1ik",
    "name": "Estadio Ramón Sánchez Pizjuán",
    "shortName": "Estadio Ramón Sánchez Pizjuán",
    "lat": 37.384046,
    "lon": -5.970592
  },
  "1iz38m02tzgh8x5a9yg2ztgyc": {
    "id": "2nrn0y55nz9ee7p9adzbb7fta",
    "name": "Stadio Renato Dall'Ara",
    "shortName": "Stadio Renato Dall'Ara",
    "lat": 44.49229,
    "lon": 11.309957
  },
  "716vp99sj88laxm7ujwt3ua6s": {
    "id": "ajntng3bgkrny5s8tc69kuvhe",
    "name": "Campos de Sport de El Sardinero",
    "shortName": "Campos de Sport de El Sardinero",
    "lat": 43.476299,
    "lon": -3.793282
  },
  "74bcvvm904qkcuhw7x2eun9jo": {
    "id": "4ydszy39adhtczo02as8gdqup",
    "name": "Estadio Coliseum",
    "shortName": "Estadio Coliseum",
    "lat": 40.325729,
    "lon": -3.714964
  },
  "8ibp4zw9an61s04zlhid9k8pg": {
    "id": "5vi823w1xbyl2zofc31za3o3x",
    "name": "Estadio Nuevo Los Cármenes",
    "shortName": "Estadio Nuevo Los Cármenes",
    "lat": 37.152946,
    "lon": -3.595737
  },
  "8j3l6y3sjyoc4p8witck4pwr8": {
    "id": "db9wysa0fadbruz7xv4kgsbgu",
    "name": "UD Almería Stadium",
    "shortName": "UD Almería Stadium",
    "lat": 36.840039,
    "lon": -2.435457
  },
  "8l0tfgfiokq3eu0cyhy2xek2c": {
    "id": "6921s9eujz3nd0utbsxeocr5o",
    "name": "Estadio Municipal de El Plantío",
    "shortName": "Estadio Municipal de El Plantío",
    "lat": 42.344266,
    "lon": -3.6806
  },
  "8d8fm7wli7tfx8hm9w5l8nuhg": {
    "id": "51rz2fp2i3mhe3vd7avmchpd8",
    "name": "Estadio de Gran Canaria",
    "shortName": "Estadio de Gran Canaria",
    "lat": 28.100362,
    "lon": -15.456707
  },
  "8dmcz3k1u4ze53nvrsoz7eoes": {
    "id": "63dh9i87h7ipxwwcp36aslpfr",
    "name": "Estadio La Rosaleda",
    "shortName": "Estadio La Rosaleda",
    "lat": 36.734209,
    "lon": -4.426602
  },
  "73zvl5ha7i4e8lo6sphnf613o": {
    "id": "46sq3vgaf79kjl0yd82jm3t5n",
    "name": "RCDE Stadium",
    "shortName": "RCDE Stadium",
    "lat": 41.34786,
    "lon": 2.075622
  },
  "8lektpju5p8dtppcyblv48wes": {
    "id": "dnkdxzeeh8i3y8d6pqg9ill6k",
    "name": "Estadio SkyFi Castalia",
    "shortName": "Estadio SkyFi Castalia",
    "lat": 39.996126,
    "lon": -0.038629
  },
  "7g5z6gdg6ktcxkekczh38uwwk": {
    "id": "a7seakd3sc1cf9nbxfrlgj4o",
    "name": "Estadio Benito Villamarín",
    "shortName": "Estadio Benito Villamarín",
    "lat": 37.35645,
    "lon": -5.981777
  },
  "74mxh8k281gelgxpzaagmamfo": {
    "id": "63dh9i87h7ipxwwcp36aslpfr",
    "name": "Estadio La Rosaleda",
    "shortName": "Estadio La Rosaleda",
    "lat": 36.734209,
    "lon": -4.426602
  },
  "7000rk9jiemwpjw2i9tnpim8k": {
    "id": "7r0v5px7gqs90ak0n46oyg6vy",
    "name": "Estadio Abanca-Riazor",
    "shortName": "Estadio Abanca-Riazor",
    "lat": 43.36872,
    "lon": -8.41753
  },
  "7aptq9m7p1p3ezgnl011sdafo": {
    "id": "4ydszy39adhtczo02as8gdqup",
    "name": "Estadio Coliseum",
    "shortName": "Estadio Coliseum",
    "lat": 40.325729,
    "lon": -3.714964
  },
  "8fydg367drpc25r1bobxqj3f8": {
    "id": "6adzn0heykaqyc6dxmblmlxit",
    "name": "Estadio Municipal de Anduva",
    "shortName": "Estadio Municipal de Anduva",
    "lat": 42.680826,
    "lon": -2.935431
  },
  "8h6429zr5ijqcxc8gjxygjtw4": {
    "id": "a49b01dcsa1ntf00op34hr64o",
    "name": "JP Financial Estadio",
    "shortName": "JP Financial Estadio",
    "lat": 36.502552,
    "lon": -6.272941
  },
  "70ecxis8a4v87q3igbbhvxn2s": {
    "id": "46sq3vgaf79kjl0yd82jm3t5n",
    "name": "RCDE Stadium",
    "shortName": "RCDE Stadium",
    "lat": 41.34786,
    "lon": 2.075622
  },
  "759wkks5e6lybl2205pedxgd0": {
    "id": "emjk2wbulbnruj028iwz6lznl",
    "name": "Estadio Ontime Butarque",
    "shortName": "Estadio Ontime Butarque",
    "lat": 40.340472,
    "lon": -3.760688
  },
  "74ycln8d7fq9w6x1kyk1gr504": {
    "id": "23fwsofybpbwfcxjrysy6on19",
    "name": "Estadio El Sadar",
    "shortName": "Estadio El Sadar",
    "lat": 42.796677,
    "lon": -1.637141
  },
  "8f6gex4eh119d2hh9y2zb5clw": {
    "id": "85lymf2x6g56j8qm162gp5kkg",
    "name": "Estadio Municipal de Ipurúa",
    "shortName": "Estadio Municipal de Ipurúa",
    "lat": 43.181765,
    "lon": -2.475851
  },
  "5x22do769ggspxs4t2pjr26tw": {
    "id": "ss9g55mz9dhnxdiabt5ya8n2",
    "name": "Stadionul Eugen Popescu",
    "shortName": "Stadionul Eugen Popescu",
    "lat": 44.931577,
    "lon": 25.462253
  },
  "8k94qvmdvsycrxzlbprx5c0es": {
    "id": "5lzxhuc7xg04gxrcc3v3sggb1",
    "name": "Instalaciones de Zubieta Z7",
    "shortName": "Instalaciones de Zubieta Z7",
    "lat": 43.257764,
    "lon": -2.02599
  },
  "8ipngy9mmx0rx8i4bqwc3807o": {
    "id": "emjk2wbulbnruj028iwz6lznl",
    "name": "Estadio Ontime Butarque",
    "shortName": "Estadio Ontime Butarque",
    "lat": 40.340472,
    "lon": -3.760688
  },
  "72e6g9h1pn6n02wyh6hi1e49g": {
    "id": "8ell9vv21ntqufsr5a4qyvjlg",
    "name": "Estadio de Mestalla",
    "shortName": "Estadio de Mestalla",
    "lat": 39.474602,
    "lon": -0.358257
  },
  "ar8b186wqraa80u0vpi2e4nis": {
    "id": "cvuokh4pfnm36j8syktfre7u2",
    "name": "New York New Jersey Stadium",
    "shortName": "New York New Jersey Stadium",
    "lat": 40.813553,
    "lon": -74.074368
  },
  "8kmvxdfvwq3sx8hx5cb7qr1g4": {
    "id": "9312ttjad8o1bk96nv6vlev4k",
    "name": "Ibercaja Estadio",
    "shortName": "Ibercaja Estadio",
    "lat": 41.684111,
    "lon": -0.895763
  },
  "8jl294wug2pecy5pb2qbzyjh0": {
    "id": "dnkdxzeeh8i3y8d6pqg9ill6k",
    "name": "Estadio SkyFi Castalia",
    "shortName": "Estadio SkyFi Castalia",
    "lat": 39.996126,
    "lon": -0.038629
  }
};

// Mapa de sedes por ID del equipo local
export const TEAM_VENUES: Record<string, VenueInfo> = {
  "74mcjsm72vr3l9pw2i4qfjchj": {
    "id": "d9i7k0es5x4ccxcapt1fcg9c2",
    "name": "Estadio de la Cerámica",
    "shortName": "Estadio de la Cerámica",
    "lat": 39.944119,
    "lon": -0.103474
  },
  "7h7eg7q7dbwvzww78h9d5eh0h": {
    "id": "3y2qrs9lma04q7tntobgey3s8",
    "name": "Estadi Municipal de Montilivi",
    "shortName": "Estadi Municipal de Montilivi",
    "lat": 41.961195,
    "lon": 2.828495
  },
  "ba5e91hjacvma2sjvixn00pjo": {
    "id": "8ell9vv21ntqufsr5a4qyvjlg",
    "name": "Estadio de Mestalla",
    "shortName": "Estadio de Mestalla",
    "lat": 39.474602,
    "lon": -0.358257
  },
  "3kq9cckrnlogidldtdie2fkbl": {
    "id": "7o6sbdki1c1b3f54ga3xj5abb",
    "name": "Estadio Bernabéu",
    "shortName": "Estadio Bernabéu",
    "lat": 40.453068,
    "lon": -3.688354
  },
  "50x1m4u58lffhq6v6ga1hbxmy": {
    "id": "awbbogt2i6macegd87pre8044",
    "name": "Estadi Mallorca Son Moix",
    "shortName": "Estadi Mallorca Son Moix",
    "lat": 39.58994,
    "lon": 2.630078
  },
  "1n1j0wsl763lq7ee1k0c11c02": {
    "id": "4ydszy39adhtczo02as8gdqup",
    "name": "Estadio Coliseum",
    "shortName": "Estadio Coliseum",
    "lat": 40.325729,
    "lon": -3.714964
  },
  "c8llrezkm3b3op4afrou6b487": {
    "id": "46sq3vgaf79kjl0yd82jm3t5n",
    "name": "RCDE Stadium",
    "shortName": "RCDE Stadium",
    "lat": 41.34786,
    "lon": 2.075622
  },
  "6f27yvbqcngegwsg2ozxxdj4": {
    "id": "8z6nwwiy8h2kqq7z3yxf7aqti",
    "name": "Estadio Abanca-Balaídos",
    "shortName": "Estadio Abanca-Balaídos",
    "lat": 42.211852,
    "lon": -8.739721
  },
  "ah8dala7suqqkj04n2l8xz4zd": {
    "id": "benito_villamarin",
    "name": "Estadio Benito Villamarín",
    "shortName": "Benito Villamarín",
    "lat": 37.35645,
    "lon": -5.981777
  },
  "4dtdjgnpdq9uw4sdutti0vaar": {
    "id": "26ycul6lcermwam7oxr57qyny",
    "name": "Estadio de Mendizorroza",
    "shortName": "Estadio de Mendizorroza",
    "lat": 42.837076,
    "lon": -2.688247
  },
  "agh9ifb2mw3ivjusgedj7c3fe": {
    "id": "spotify_camp_nou",
    "name": "Spotify Camp Nou",
    "shortName": "Camp Nou",
    "lat": 41.38089,
    "lon": 2.122813
  },
  "10eyb18v5puw4ez03ocaug09m": {
    "id": "81guly6ecfrnsu6pfs0qqb1ik",
    "name": "Estadio Ramón Sánchez Pizjuán",
    "shortName": "Estadio Ramón Sánchez Pizjuán",
    "lat": 37.384046,
    "lon": -5.970592
  },
  "2l0ldgiwsgb8d6y3z0sfgjzyj": {
    "id": "23fwsofybpbwfcxjrysy6on19",
    "name": "Estadio El Sadar",
    "shortName": "Estadio El Sadar",
    "lat": 42.796677,
    "lon": -1.637141
  },
  "clo928vcczjp0mczavs5o7p5k": {
    "id": "1i6aurveqizhdsg4bgdhprlom",
    "name": "Estadio Municipal Carlos Tartiere",
    "shortName": "Estadio Municipal Carlos Tartiere",
    "lat": 43.360762,
    "lon": -5.870261
  },
  "63f5h8t5e9qm1fqmvfkb23ghh": {
    "id": "bpfd0sk353ozrgi4jrjs5qgqs",
    "name": "Estadio Municipal de Anoeta",
    "shortName": "Estadio Municipal de Anoeta",
    "lat": 43.301376,
    "lon": -1.973602
  },
  "3budh3j9xivsid3ptm8ptpy4k": {
    "id": "6wek5bab1al0qtnl6pjyntp42",
    "name": "Estadio de Vallecas",
    "shortName": "Estadio de Vallecas",
    "lat": 40.391823,
    "lon": -3.658589
  },
  "4grc9qgcvusllap8h5j6gc5h5": {
    "id": "2n6pw21w4t9kc955w78ryjkyr",
    "name": "Estadio Ciudad de Valencia",
    "shortName": "Estadio Ciudad de Valencia",
    "lat": 39.494686,
    "lon": -0.36382
  },
  "4yg9ttzw0m51048doksv8uq5r": {
    "id": "4rog35zkswi1nymg8o55ppiag",
    "name": "Estadio Manuel Martínez Valero",
    "shortName": "Estadio Manuel Martínez Valero",
    "lat": 38.267129,
    "lon": -0.6633
  },
  "4ku8o6uf87yd8iecdalipo6wd": {
    "id": "4dki5bxv1ttz1c9vkeifguc45",
    "name": "Riyadh Air Metropolitano",
    "shortName": "Riyadh Air Metropolitano",
    "lat": 40.436226,
    "lon": -3.59946
  },
  "3czravw89omgc9o4s0w3l1bg5": {
    "id": "3tsyaiz1y1gg31xw81qgtrx4w",
    "name": "Estadio de San Mamés",
    "shortName": "Estadio de San Mamés",
    "lat": 43.264173,
    "lon": -2.949383
  },
  "4jelr92fsge73q39is6qvhxb3": {
    "id": "1wuzt3ym8ch1pd9qbb1qw7dg2",
    "name": "Estadio Municipal José Zorrilla",
    "shortName": "Estadio Municipal José Zorrilla",
    "lat": 41.64458,
    "lon": -4.761264
  },
  "13zq8jfp5uydowd3ibknxaffj": {
    "id": "azf08zxtvr8njwk8gch6a5p97",
    "name": "Estadio Carlos Belmonte",
    "shortName": "Estadio Carlos Belmonte",
    "lat": 38.981146,
    "lon": -1.852114
  },
  "chhfxt372lm29p9b96fr2ho4q": {
    "id": "c6uztn87oaloqusnpi0dvwxsk",
    "name": "Estadi de la FAF d'Encamp",
    "shortName": "Estadi de la FAF d'Encamp",
    "lat": 42.533481,
    "lon": 1.575929
  },
  "1r541mega6d838hi0p44sv0h2": {
    "id": "7r0v5px7gqs90ak0n46oyg6vy",
    "name": "Estadio Abanca-Riazor",
    "shortName": "Riazor",
    "lat": 43.36872,
    "lon": -8.41753
  },
  "egfc4v1d08dgbhkw8gxz85bzr": {
    "id": "b6t5wrbem9m6yfm4btbwgs3h9",
    "name": "Estadio El Alcoraz",
    "shortName": "Estadio El Alcoraz",
    "lat": 42.131891,
    "lon": -0.424599
  },
  "9wfi6tgumbrnkp72z8zab89kr": {
    "id": "akfuu0slee15x4lefqv139slc",
    "name": "Estadio Municipal El Molinón-Enrique Castro Quini",
    "shortName": "Estadio Municipal El Molinón-Enrique Castro Quini",
    "lat": 43.536284,
    "lon": -5.637397
  },
  "7tpg5hj5gutjb58m6trjcaika": {
    "id": "6wftla6xnkf7wishleu0lizh",
    "name": "Estadio Nuevo Arcángel",
    "shortName": "Estadio Nuevo Arcángel",
    "lat": 37.872239,
    "lon": -4.764539
  },
  "4szvjv7xibphumticc9438w2g": {
    "id": "4erh6oe0fppxpuy8nc3jlv78h",
    "name": "Estadio Municipal Reino de León",
    "shortName": "Estadio Municipal Reino de León",
    "lat": 42.587397,
    "lon": -5.577064
  },
  "bzkwzatvwahmbzok1ymm5vqa1": {
    "id": "ajntng3bgkrny5s8tc69kuvhe",
    "name": "Campos de Sport de El Sardinero",
    "shortName": "El Sardinero",
    "lat": 43.476299,
    "lon": -3.793282
  },
  "581uscajzg0lfxpfnjwpiif11": {
    "id": "87ugb3mvhk063nh378aaqmqep",
    "name": "Estadio Municipal Alfonso Murube",
    "shortName": "Estadio Municipal Alfonso Murube",
    "lat": 35.88546,
    "lon": -5.327945
  },
  "ej5er0oyngdw138yuumwqbyqt": {
    "id": "2nrn0y55nz9ee7p9adzbb7fta",
    "name": "Stadio Renato Dall'Ara",
    "shortName": "Stadio Renato Dall'Ara",
    "lat": 44.49229,
    "lon": 11.309957
  },
  "26fes5ubaeq0fk1nay2pj2ob2": {
    "id": "5vi823w1xbyl2zofc31za3o3x",
    "name": "Estadio Nuevo Los Cármenes",
    "shortName": "Estadio Nuevo Los Cármenes",
    "lat": 37.152946,
    "lon": -3.595737
  },
  "cobffe32r7g4skka9m19qib63": {
    "id": "db9wysa0fadbruz7xv4kgsbgu",
    "name": "UD Almería Stadium",
    "shortName": "UD Almería Stadium",
    "lat": 36.840039,
    "lon": -2.435457
  },
  "9dh08biovdh6rzklzlf3zvezi": {
    "id": "6921s9eujz3nd0utbsxeocr5o",
    "name": "Estadio Municipal de El Plantío",
    "shortName": "Estadio Municipal de El Plantío",
    "lat": 42.344266,
    "lon": -3.6806
  },
  "1ae3awgwm3i1jds5tfct5441j": {
    "id": "51rz2fp2i3mhe3vd7avmchpd8",
    "name": "Estadio de Gran Canaria",
    "shortName": "Estadio de Gran Canaria",
    "lat": 28.100362,
    "lon": -15.456707
  },
  "7012hpp3p5vg4fzyn3h0yvf09": {
    "id": "63dh9i87h7ipxwwcp36aslpfr",
    "name": "Estadio La Rosaleda",
    "shortName": "La Rosaleda",
    "lat": 36.734209,
    "lon": -4.426602
  },
  "5ziakdomggtzs5xqnb50jpi5o": {
    "id": "dnkdxzeeh8i3y8d6pqg9ill6k",
    "name": "Estadio SkyFi Castalia",
    "shortName": "Estadio SkyFi Castalia",
    "lat": 39.996126,
    "lon": -0.038629
  },
  "a745ojopc6f75ma1fyfzayono": {
    "id": "6adzn0heykaqyc6dxmblmlxit",
    "name": "Estadio Municipal de Anduva",
    "shortName": "Estadio Municipal de Anduva",
    "lat": 42.680826,
    "lon": -2.935431
  },
  "82q9159y2u7mkfn3z6hy75r4o": {
    "id": "a49b01dcsa1ntf00op34hr64o",
    "name": "JP Financial Estadio",
    "shortName": "JP Financial Estadio",
    "lat": 36.502552,
    "lon": -6.272941
  },
  "bjltc68ihd23uu3svnq0o3qrs": {
    "id": "85lymf2x6g56j8qm162gp5kkg",
    "name": "Estadio Municipal de Ipurúa",
    "shortName": "Estadio Municipal de Ipurúa",
    "lat": 43.181765,
    "lon": -2.475851
  },
  "algr7w7tg3c3q1uxph9u42t2m": {
    "id": "ss9g55mz9dhnxdiabt5ya8n2",
    "name": "Stadionul Eugen Popescu",
    "shortName": "Stadionul Eugen Popescu",
    "lat": 44.931577,
    "lon": 25.462253
  },
  "8drpno9gdt807yn09qdud0kzb": {
    "id": "5lzxhuc7xg04gxrcc3v3sggb1",
    "name": "Instalaciones de Zubieta Z7",
    "shortName": "Instalaciones de Zubieta Z7",
    "lat": 43.257764,
    "lon": -2.02599
  },
  "3krm0f4yr1l80j1sd7823f9xn": {
    "id": "emjk2wbulbnruj028iwz6lznl",
    "name": "Estadio Ontime Butarque",
    "shortName": "Estadio Ontime Butarque",
    "lat": 40.340472,
    "lon": -3.760688
  },
  "ajab3nmpoltsoeqcuoyi4pwzx": {
    "id": "cvuokh4pfnm36j8syktfre7u2",
    "name": "New York New Jersey Stadium",
    "shortName": "New York New Jersey Stadium",
    "lat": 40.813553,
    "lon": -74.074368
  },
  "6iwco2hhg7gp3bc9ywku4881k": {
    "id": "9312ttjad8o1bk96nv6vlev4k",
    "name": "Ibercaja Estadio",
    "shortName": "Ibercaja Estadio",
    "lat": 41.684111,
    "lon": -0.895763
  }
};

// Lista de reglas por orden de prioridad para emparejar por nombre de equipo
export const ORDERED_KEYWORD_VENUES: [string, VenueInfo][] = [
  [
    "alaves",
    {
      "id": "mendizorroza",
      "name": "Estadio de Mendizorroza",
      "shortName": "Mendizorroza",
      "lat": 42.837076,
      "lon": -2.688247
    }
  ],
  [
    "coruna",
    {
      "id": "riazor",
      "name": "Estadio Abanca-Riazor",
      "shortName": "Riazor",
      "lat": 43.36872,
      "lon": -8.41753
    }
  ],
  [
    "riazor",
    {
      "id": "riazor",
      "name": "Estadio Abanca-Riazor",
      "shortName": "Riazor",
      "lat": 43.36872,
      "lon": -8.41753
    }
  ],
  [
    "deportivo de a coruna",
    {
      "id": "riazor",
      "name": "Estadio Abanca-Riazor",
      "shortName": "Riazor",
      "lat": 43.36872,
      "lon": -8.41753
    }
  ],
  [
    "deportivo de la coruna",
    {
      "id": "riazor",
      "name": "Estadio Abanca-Riazor",
      "shortName": "Riazor",
      "lat": 43.36872,
      "lon": -8.41753
    }
  ],
  [
    "rc deportivo",
    {
      "id": "riazor",
      "name": "Estadio Abanca-Riazor",
      "shortName": "Riazor",
      "lat": 43.36872,
      "lon": -8.41753
    }
  ],
  [
    "malaga",
    {
      "id": "rosaleda",
      "name": "Estadio La Rosaleda",
      "shortName": "La Rosaleda",
      "lat": 36.734209,
      "lon": -4.426602
    }
  ],
  [
    "racing",
    {
      "id": "sardinero",
      "name": "Campos de Sport de El Sardinero",
      "shortName": "El Sardinero",
      "lat": 43.476299,
      "lon": -3.793282
    }
  ],
  [
    "levante",
    {
      "id": "ciudad_valencia",
      "name": "Estadio Ciudad de Valencia",
      "shortName": "Ciutat de València",
      "lat": 39.494686,
      "lon": -0.36382
    }
  ],
  [
    "atletico de madrid",
    {
      "id": "metropolitano",
      "name": "Riyadh Air Metropolitano",
      "shortName": "Metropolitano",
      "lat": 40.436226,
      "lon": -3.59946
    }
  ],
  [
    "club atletico",
    {
      "id": "metropolitano",
      "name": "Riyadh Air Metropolitano",
      "shortName": "Metropolitano",
      "lat": 40.436226,
      "lon": -3.59946
    }
  ],
  [
    "barcelona",
    {
      "id": "camp_nou",
      "name": "Spotify Camp Nou",
      "shortName": "Camp Nou",
      "lat": 41.38089,
      "lon": 2.122813
    }
  ],
  [
    "barca",
    {
      "id": "camp_nou",
      "name": "Spotify Camp Nou",
      "shortName": "Camp Nou",
      "lat": 41.38089,
      "lon": 2.122813
    }
  ],
  [
    "real madrid",
    {
      "id": "bernabeu",
      "name": "Estadio Bernabéu",
      "shortName": "Bernabéu",
      "lat": 40.453068,
      "lon": -3.688354
    }
  ],
  [
    "valencia cf",
    {
      "id": "mestalla",
      "name": "Estadio de Mestalla",
      "shortName": "Mestalla",
      "lat": 39.474602,
      "lon": -0.358257
    }
  ],
  [
    "valencia",
    {
      "id": "mestalla",
      "name": "Estadio de Mestalla",
      "shortName": "Mestalla",
      "lat": 39.474602,
      "lon": -0.358257
    }
  ],
  [
    "sevilla",
    {
      "id": "pizjuan",
      "name": "Estadio Ramón Sánchez-Pizjuán",
      "shortName": "Sánchez-Pizjuán",
      "lat": 37.384046,
      "lon": -5.970592
    }
  ],
  [
    "betis",
    {
      "id": "villamarin",
      "name": "Estadio Benito Villamarín",
      "shortName": "Benito Villamarín",
      "lat": 37.35645,
      "lon": -5.981777
    }
  ],
  [
    "athletic",
    {
      "id": "san_mames",
      "name": "Estadio de San Mamés",
      "shortName": "San Mamés",
      "lat": 43.264173,
      "lon": -2.949383
    }
  ],
  [
    "celta",
    {
      "id": "balaidos",
      "name": "Estadio Abanca-Balaídos",
      "shortName": "Balaídos",
      "lat": 42.211852,
      "lon": -8.739721
    }
  ],
  [
    "sociedad",
    {
      "id": "anoeta",
      "name": "Estadio Municipal de Anoeta",
      "shortName": "Anoeta",
      "lat": 43.301376,
      "lon": -1.973602
    }
  ],
  [
    "osasuna",
    {
      "id": "sadar",
      "name": "Estadio El Sadar",
      "shortName": "El Sadar",
      "lat": 42.796677,
      "lon": -1.637141
    }
  ],
  [
    "rayo",
    {
      "id": "vallecas",
      "name": "Estadio de Vallecas",
      "shortName": "Vallecas",
      "lat": 40.391823,
      "lon": -3.658589
    }
  ],
  [
    "getafe",
    {
      "id": "coliseum",
      "name": "Estadio Coliseum",
      "shortName": "Coliseum",
      "lat": 40.325729,
      "lon": -3.714964
    }
  ],
  [
    "villarreal",
    {
      "id": "ceramica",
      "name": "Estadio de la Cerámica",
      "shortName": "La Cerámica",
      "lat": 39.944119,
      "lon": -0.103474
    }
  ],
  [
    "girona",
    {
      "id": "montilivi",
      "name": "Estadi Municipal de Montilivi",
      "shortName": "Montilivi",
      "lat": 41.961195,
      "lon": 2.828495
    }
  ],
  [
    "mallorca",
    {
      "id": "son_moix",
      "name": "Estadi Mallorca Son Moix",
      "shortName": "Son Moix",
      "lat": 39.58994,
      "lon": 2.630078
    }
  ],
  [
    "espanyol",
    {
      "id": "rcde",
      "name": "RCDE Stadium",
      "shortName": "RCDE Stadium",
      "lat": 41.34786,
      "lon": 2.075622
    }
  ],
  [
    "elche",
    {
      "id": "valero",
      "name": "Estadio Manuel Martínez Valero",
      "shortName": "Martínez Valero",
      "lat": 38.267129,
      "lon": -0.6633
    }
  ],
  [
    "oviedo",
    {
      "id": "tartiere",
      "name": "Estadio Municipal Carlos Tartiere",
      "shortName": "Carlos Tartiere",
      "lat": 43.360762,
      "lon": -5.870261
    }
  ],
  [
    "zaragoza",
    {
      "id": "romareda",
      "name": "Estadio La Romareda",
      "shortName": "La Romareda",
      "lat": 41.6325,
      "lon": -0.901667
    }
  ],
  [
    "valladolid",
    {
      "id": "zorrilla",
      "name": "Estadio Municipal José Zorrilla",
      "shortName": "José Zorrilla",
      "lat": 41.64458,
      "lon": -4.761264
    }
  ],
  [
    "leganes",
    {
      "id": "butarque",
      "name": "Estadio Ontime Butarque",
      "shortName": "Butarque",
      "lat": 40.340472,
      "lon": -3.760688
    }
  ],
  [
    "eibar",
    {
      "id": "ipurua",
      "name": "Estadio Municipal de Ipurúa",
      "shortName": "Ipurúa",
      "lat": 43.181765,
      "lon": -2.475851
    }
  ],
  [
    "sporting",
    {
      "id": "molinon",
      "name": "Estadio Municipal El Molinón",
      "shortName": "El Molinón",
      "lat": 43.536284,
      "lon": -5.637397
    }
  ],
  [
    "almeria",
    {
      "id": "almeria_stadium",
      "name": "UD Almería Stadium",
      "shortName": "Power Horse",
      "lat": 36.840039,
      "lon": -2.435457
    }
  ],
  [
    "granada",
    {
      "id": "carmenes",
      "name": "Estadio Nuevo Los Cármenes",
      "shortName": "Los Cármenes",
      "lat": 37.152946,
      "lon": -3.595737
    }
  ],
  [
    "las palmas",
    {
      "id": "gran_canaria",
      "name": "Estadio de Gran Canaria",
      "shortName": "Gran Canaria",
      "lat": 28.100362,
      "lon": -15.456707
    }
  ],
  [
    "castellon",
    {
      "id": "castalia",
      "name": "Estadio SkyFi Castalia",
      "shortName": "Castalia",
      "lat": 39.996126,
      "lon": -0.038629
    }
  ],
  [
    "cadiz",
    {
      "id": "mirandilla",
      "name": "Estadio Nuevo Mirandilla",
      "shortName": "Nuevo Mirandilla",
      "lat": 36.502552,
      "lon": -6.272941
    }
  ],
  [
    "cordoba",
    {
      "id": "arcangel",
      "name": "Estadio Nuevo Arcángel",
      "shortName": "Nuevo Arcángel",
      "lat": 37.872239,
      "lon": -4.764539
    }
  ],
  [
    "burgos",
    {
      "id": "plantio",
      "name": "Estadio Municipal de El Plantío",
      "shortName": "El Plantío",
      "lat": 42.344266,
      "lon": -3.6806
    }
  ],
  [
    "huesca",
    {
      "id": "alcoraz",
      "name": "Estadio El Alcoraz",
      "shortName": "El Alcoraz",
      "lat": 42.131891,
      "lon": -0.424599
    }
  ],
  [
    "mirandes",
    {
      "id": "anduva",
      "name": "Estadio Municipal de Anduva",
      "shortName": "Anduva",
      "lat": 42.680826,
      "lon": -2.935431
    }
  ],
  [
    "albacete",
    {
      "id": "belmonte",
      "name": "Estadio Carlos Belmonte",
      "shortName": "Carlos Belmonte",
      "lat": 38.981146,
      "lon": -1.852114
    }
  ]
];

/**
 * Normaliza una cadena quitando tildes y caracteres especiales
 */
function normalizeStr(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

/**
 * Obtiene la información del estadio para un partido dado su ID, ID del equipo local y/o nombre del equipo
 */
export function getVenueInfo(
  fixtureId?: string | null,
  homeTeamId?: string | null,
  homeTeamName?: string | null
): VenueInfo | null {
  if (fixtureId && FIXTURE_VENUES[fixtureId]) {
    return FIXTURE_VENUES[fixtureId]
  }
  if (homeTeamId && TEAM_VENUES[homeTeamId]) {
    return TEAM_VENUES[homeTeamId]
  }
  if (homeTeamName) {
    const norm = normalizeStr(homeTeamName)
    for (const [kw, venue] of ORDERED_KEYWORD_VENUES) {
      if (norm.includes(kw)) {
        return venue
      }
    }
  }
  return null
}

/**
 * Genera la URL de la foto de satélite de alta resolución (ArcGIS Esri World Imagery)
 * Se ajusta el bounding box centrado en las coordenadas del estadio
 */
export function getStadiumSatelliteUrl(lat: number, lon: number, width = 800, height = 450): string {
  // Delta para encuadrar el campo de fútbol perfectamente (zoom centrado en el terreno de juego)
  const dLat = 0.0018
  const dLon = 0.0032
  const minLon = (lon - dLon).toFixed(6)
  const minLat = (lat - dLat).toFixed(6)
  const maxLon = (lon + dLon).toFixed(6)
  const maxLat = (lat + dLat).toFixed(6)
  const bbox = `${minLon},${minLat},${maxLon},${maxLat}`

  return `https://services.arcgisonline.com/arcgis/rest/services/World_Imagery/MapServer/export?bbox=${bbox}&bboxSR=4326&imageSR=4326&size=${width},${height}&format=jpg&f=image`
}

/**
 * URL para abrir el estadio directamente en Google Maps en vista satélite
 */
export function getGoogleMapsSatelliteUrl(lat: number, lon: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lon}&t=k`
}
