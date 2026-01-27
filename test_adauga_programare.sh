#!/bin/bash

# Test script pentru AdaugaProgramare
# Folosește curl pentru a testa POST request-ul

API_KEY="sVhuDqQw9AMRH33feWFBsNDxxe5jr3UDjqvm7lr4NEdje6n4cEYaZvBl9tko87N3R0Gep78JGDuy5"
BASE_URL="https://supersmilesib.digitalclinic.ro/api/PacientAPI/AdaugaProgramare"

echo "Testing AdaugaProgramare..."
echo ""

curl -X POST "$BASE_URL" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "pCheie=$API_KEY" \
  -d "pNumeCompletPacient=Test Nume" \
  -d "pTelefonPacient=40712345678" \
  -d "pAdresaMailPacient=" \
  -d "pDataDDMMYYYYHHMM=280120261030" \
  -d "pDurataInMinute=30" \
  -d "pIdSpecialist=2" \
  -d "pIdCabinet=1" \
  -d "pCategorie=Consultatie" \
  -d "pObservatii=Test"

echo ""
echo ""
echo "Dacă vezi '13' sau '<string>13</string>', înseamnă SUCCES!"
echo "Dacă vezi eroare 500, medicul nu are program definit pentru data/ora respectivă."
