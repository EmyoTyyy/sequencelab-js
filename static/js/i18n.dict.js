/* =================================================================== *
 *  SequenceLab — French dictionary (English → French).
 *
 *  Loaded before i18n.js. Keys are the exact English UI strings (trimmed
 *  of surrounding whitespace as they appear in the DOM/source). Entries
 *  with {0}, {1} placeholders are used by I18N.t() for interpolated
 *  strings. SQL keywords, example queries and identifiers are NOT here —
 *  SQL is a fixed language and stays English.
 * =================================================================== */
window.SL_FR_DICT = {
  // ===================== menu bar =====================
  "File": "Fichier",
  "Edit": "Édition",
  "View": "Affichage",
  "Help": "Aide",
  "Show/hide side panel (Alt+S)": "Afficher/masquer le panneau latéral (Alt+S)",
  "Show/hide JSON row viewer": "Afficher/masquer le visualiseur de ligne JSON",

  // File menu
  "New database…": "Nouvelle base de données…",
  "Open database file…": "Ouvrir un fichier de base de données…",
  "Close database…": "Fermer la base de données…",
  "Reset example database": "Réinitialiser la base d'exemple",
  "Save as snippet…": "Enregistrer comme extrait…",
  "Import data (CSV / JSON / Excel)…": "Importer des données (CSV / JSON / Excel)…",
  "Import SQL file…": "Importer un fichier SQL…",
  "Export database as SQL": "Exporter la base de données en SQL",
  "Save database (file / download)": "Enregistrer la base (fichier / téléchargement)",
  "Attach database…": "Attacher une base de données…",
  "Database tools…": "Outils de base de données…",
  "Database settings…": "Paramètres de base de données…",
  // Edit menu
  "Undo": "Annuler",
  "Redo": "Rétablir",
  "Cut": "Couper",
  "Select all": "Tout sélectionner",
  "Format": "Formater",
  "Search database…": "Rechercher dans la base…",
  "Clipboard blocked by browser — use Ctrl+V": "Presse-papiers bloqué par le navigateur — utilisez Ctrl+V",
  // View menu
  "Reset zoom": "Réinitialiser le zoom",
  "Zoom in": "Zoom avant",
  "Zoom out": "Zoom arrière",
  "Reset editor font size": "Réinitialiser la taille de police de l'éditeur",
  "Increase editor font size": "Augmenter la taille de police de l'éditeur",
  "Decrease editor font size": "Réduire la taille de police de l'éditeur",
  "Toggle primary sidebar": "Afficher/masquer la barre latérale principale",
  "Toggle secondary sidebar": "Afficher/masquer la barre latérale secondaire",
  "Reload window": "Recharger la fenêtre",
  "Toggle full screen": "Basculer en plein écran",
  "Toggle privacy mode": "Basculer le mode confidentialité",
  // Help menu
  "Keyboard shortcuts": "Raccourcis clavier",
  "About SequenceLab": "À propos de SequenceLab",
  "About": "À propos",
  "A local SQLite workbench. Databases as real .db files, everything fully offline — no cloud, no account, no telemetry.":
    "Un atelier SQLite local. Des bases de données sous forme de vrais fichiers .db, le tout entièrement hors ligne — pas de cloud, pas de compte, pas de télémétrie.",

  // ===================== icon rail =====================
  "Editor": "Éditeur",
  "Database & SQL editor": "Base de données et éditeur SQL",
  "Files": "Fichiers",
  "File explorer": "Explorateur de fichiers",
  "Snippets": "Extraits",
  "Saved snippets": "Extraits enregistrés",
  "History": "Historique",
  "Query history": "Historique des requêtes",
  "Syntax": "Syntaxe",
  "SQL syntax reference": "Référence de syntaxe SQL",
  "Browse": "Parcourir",
  "Browse data": "Parcourir les données",
  "Filters": "Filtres",
  "Saved filters": "Filtres enregistrés",
  "Diagram": "Diagramme",
  "ER diagram": "Diagramme ER",
  "Layouts": "Dispositions",
  "Saved layouts": "Dispositions enregistrées",
  "Notes": "Notes",
  "Legend & notes": "Légende et notes",
  "Settings": "Paramètres",

  // ===================== sidebar / schema =====================
  "Active database": "Base de données active",
  "Refresh schema": "Actualiser le schéma",
  "Filter": "Filtrer",
  "Pinned": "Épinglés",
  "Entities": "Entités",
  "Recent queries": "Requêtes récentes",
  "Clear history": "Effacer l'historique",
  "Filter syntax…": "Filtrer la syntaxe…",
  "Refresh files": "Actualiser les fichiers",
  "Save current editor as snippet": "Enregistrer l'éditeur actuel comme extrait",
  "Pin table": "Épingler la table",
  "Unpin table": "Désépingler la table",
  "Nothing pinned. Hover a table and click the pin.": "Rien d'épinglé. Survolez une table et cliquez sur l'épingle.",
  "Browse table": "Parcourir la table",
  "View schema": "Voir le schéma",
  "Copy table name": "Copier le nom de la table",

  // ===================== editor / run =====================
  "Run (Ctrl+Enter)": "Exécuter (Ctrl+Entrée)",
  "Run": "Exécuter",
  "Run options": "Options d'exécution",
  "Run all": "Tout exécuter",
  "Run selected": "Exécuter la sélection",
  "Run current statement": "Exécuter l'instruction actuelle",
  "Run query": "Exécuter la requête",
  "Run a CREATE TABLE statement to start.": "Exécutez une instruction CREATE TABLE pour commencer.",
  "Run destructive SQL": "Exécuter le SQL destructeur",
  "Running…": "Exécution…",
  "Find": "Rechercher",
  "Find in editor": "Rechercher dans l'éditeur",
  "Find & replace": "Rechercher et remplacer",
  "Previous match (Shift+Enter)": "Correspondance précédente (Maj+Entrée)",
  "Next match (Enter)": "Correspondance suivante (Entrée)",
  "Replace with": "Remplacer par",
  "Replace": "Remplacer",
  "All": "Tout",
  "Close (Esc)": "Fermer (Échap)",
  "-- Write SQL here.  Ctrl+Enter to run.": "-- Écrivez votre SQL ici.  Ctrl+Entrée pour exécuter.",
  "Format SQL": "Formater le SQL",
  "Toggle comment": "Activer/désactiver le commentaire",
  "Toggle side panel": "Afficher/masquer le panneau latéral",
  "Duplicate line": "Dupliquer la ligne",
  "Command palette": "Palette de commandes",
  "New query tab": "Nouvel onglet de requête",
  "Close result tab": "Fermer l'onglet de résultat",
  "Save snippet": "Enregistrer l'extrait",
  "Save as snippet": "Enregistrer comme extrait",
  "No saved snippets.": "Aucun extrait enregistré.",
  "Write SQL, then click ＋.": "Écrivez du SQL, puis cliquez sur ＋.",
  "No queries yet for this database.": "Aucune requête pour cette base pour l'instant.",
  "Statement executed.": "Instruction exécutée.",
  "This query changes no rows.": "Cette requête ne modifie aucune ligne.",
  "Nothing to run": "Rien à exécuter",
  "Nothing to explain": "Rien à expliquer",
  "Nothing to plan (not a query?)": "Rien à planifier (pas une requête ?)",
  "Stop": "Arrêter",

  // ===================== command palette =====================
  "Type a table, snippet or action…": "Tapez une table, un extrait ou une action…",
  "Editor view": "Vue Éditeur",
  "Browse view": "Vue Parcourir",
  "Diagram view": "Vue Diagramme",
  "Database tools": "Outils de base de données",
  "Database settings (PRAGMA)": "Paramètres de base de données (PRAGMA)",
  "Search database": "Rechercher dans la base",
  "Import data (CSV / JSON / Excel)": "Importer des données (CSV / JSON / Excel)",
  "Explain query plan": "Expliquer le plan de requête",
  "No match.": "Aucun résultat.",
  "Go to…": "Aller à…",
  "Query plan": "Plan de requête",
  "Query parameters": "Paramètres de requête",
  "Query it as": "L'interroger comme",
  "Search whole database": "Rechercher dans toute la base",
  "Searching…": "Recherche…",
  "Type at least 2 characters, then Enter.": "Saisissez au moins 2 caractères, puis Entrée.",

  // ===================== browse view =====================
  "Refresh": "Actualiser",
  "Save the current table + WHERE filter": "Enregistrer la table actuelle + le filtre WHERE",
  "Pick a table on the left to browse and edit its rows. Right-click any cell for actions.":
    "Choisissez une table à gauche pour parcourir et modifier ses lignes. Faites un clic droit sur une cellule pour les actions.",
  "Click to sort": "Cliquez pour trier",
  "Sort ascending": "Trier par ordre croissant",
  "Sort descending": "Trier par ordre décroissant",
  "Filter on this column": "Filtrer sur cette colonne",
  "Filter this column…": "Filtrer cette colonne…",
  "Filter result rows": "Filtrer les lignes de résultat",
  "Filter rows…": "Filtrer les lignes…",
  "Clear column filters": "Effacer les filtres de colonne",
  "Column stats": "Statistiques de colonne",
  "Copy column name": "Copier le nom de la colonne",
  "Copy": "Copier",
  "Copied": "Copié",
  "Copy as": "Copier comme",
  "Copy as INSERT statements": "Copier comme instructions INSERT",
  "Copy as Markdown": "Copier comme Markdown",
  "INSERTs copied": "INSERT copiés",
  "Markdown copied": "Markdown copié",
  "Paste": "Coller",
  "Pasted": "Collé",
  "Set NULL": "Définir NULL",
  "Set to NULL": "Défini à NULL",
  "Cleared selected cells": "Cellules sélectionnées effacées",
  "Add row": "Ajouter une ligne",
  "Clone row": "Cloner la ligne",
  "Delete row": "Supprimer la ligne",
  "Delete rows": "Supprimer les lignes",
  "Delete this row?": "Supprimer cette ligne ?",
  "Row inserted": "Ligne insérée",
  "Row deleted": "Ligne supprimée",
  "Row cloned": "Ligne clonée",
  "Saved": "Enregistré",
  "Inspect cell": "Inspecter la cellule",
  "Edit cell (Browse)": "Modifier la cellule (Parcourir)",
  "Cell value": "Valeur de la cellule",
  "Double-click to inspect": "Double-cliquez pour inspecter",
  "Double-click (read-only)": "Double-clic (lecture seule)",
  "BLOB image preview": "Aperçu d'image BLOB",
  "Select rows in Browse to delete them.": "Sélectionnez des lignes dans Parcourir pour les supprimer.",
  "This is a view (or a table without a rowid) — its rows can't be deleted.":
    "Ceci est une vue (ou une table sans rowid) — ses lignes ne peuvent pas être supprimées.",
  "This is a view (or a table without a rowid) — its cells can't be edited.":
    "Ceci est une vue (ou une table sans rowid) — ses cellules ne peuvent pas être modifiées.",
  "This result can't be edited inline.": "Ce résultat ne peut pas être modifié en ligne.",
  "Browse a table first": "Parcourez d'abord une table",
  "Clipboard blocked by browser": "Presse-papiers bloqué par le navigateur",

  // ===================== saved filters =====================
  "Filter column": "Filtrer la colonne",
  "Filter name": "Nom du filtre",
  "Filter name required": "Nom du filtre requis",
  "Filter saved": "Filtre enregistré",
  "Save filter": "Enregistrer le filtre",
  "Rename filter": "Renommer le filtre",
  "WHERE filter": "Filtre WHERE",
  "WHERE filter for": "Filtre WHERE pour",
  "Show columns": "Afficher les colonnes",
  "Show rows where": "Afficher les lignes où",
  "e.g. Active users": "ex. Utilisateurs actifs",
  "No saved filters yet.": "Aucun filtre enregistré pour l'instant.",

  // ===================== results / export =====================
  "Download CSV": "Télécharger CSV",
  "Download JSON": "Télécharger JSON",
  "Download Excel": "Télécharger Excel",
  "Save result as table": "Enregistrer le résultat comme table",
  "Save as table": "Enregistrer comme table",
  "Only query (SELECT) results can be saved as a table.": "Seuls les résultats de requête (SELECT) peuvent être enregistrés comme table.",
  "Nothing to export": "Rien à exporter",
  "No rows to chart": "Aucune ligne à représenter",
  "Chart": "Graphique",
  "Chart copied": "Graphique copié",
  "X axis": "Axe X",
  "Y axis": "Axe Y",
  "Category": "Catégorie",
  "Value": "Valeur",
  "Values": "Valeurs",
  "Columns": "Colonnes",
  "Rows": "Lignes",
  "Average": "Moyenne",
  "Sum": "Somme",
  "Min": "Min",
  "Max": "Max",
  "Distinct": "Distinctes",
  "Non-null": "Non nulles",
  "Nulls": "Nulles",
  "Top values": "Valeurs les plus fréquentes",
  "First column": "Première colonne",
  "Export": "Exporter",
  "Import": "Importer",

  // ===================== import =====================
  "Import data": "Importer des données",
  "Import copy": "Importer une copie",
  "Choose a CSV / JSON / Excel file, or paste CSV / JSON below": "Choisissez un fichier CSV / JSON / Excel, ou collez du CSV / JSON ci-dessous",
  "SQL file (or paste below)": "Fichier SQL (ou collez ci-dessous)",
  "First row is a header (CSV / Excel)": "La première ligne est un en-tête (CSV / Excel)",
  "Create table if it doesn't exist": "Créer la table si elle n'existe pas",
  "Replace rows with a matching primary key (otherwise duplicates are rejected)":
    "Remplacer les lignes ayant une clé primaire correspondante (sinon les doublons sont rejetés)",
  "Target table": "Table cible",
  "Target table required": "Table cible requise",
  "No rows found in the spreadsheet": "Aucune ligne trouvée dans le tableur",
  "Nothing to import": "Rien à importer",
  "Pick a file first": "Choisissez d'abord un fichier",

  // ===================== database / file ops =====================
  "New database": "Nouvelle base de données",
  "Database file name": "Nom du fichier de base de données",
  "Database created": "Base de données créée",
  "Database closed": "Base de données fermée",
  "Database imported": "Base de données importée",
  "Database not loaded yet": "Base de données pas encore chargée",
  "Close database": "Fermer la base de données",
  "Open .db file": "Ouvrir un fichier .db",
  "Open in Browse": "Ouvrir dans Parcourir",
  "Open with live link": "Ouvrir avec lien direct",
  "Open": "Ouvrir",
  "Pick a .db file to import (copy)": "Choisissez un fichier .db à importer (copie)",
  "Close (remove from browser)": "Fermer (retirer du navigateur)",
  "Stored as a real .db file inside the app's data/ folder.": "Stocké comme un vrai fichier .db dans le dossier data/ de l'application.",
  "Stored in this browser, per database.": "Stocké dans ce navigateur, par base de données.",
  "Live-linked — edits save back into the real file on disk": "Lié en direct — les modifications sont enregistrées dans le vrai fichier sur le disque",
  "Live-linked — every change is saved straight back into the real file on disk":
    "Lié en direct — chaque changement est enregistré directement dans le vrai fichier sur le disque",
  "Linked — edits save back into the file": "Lié — les modifications sont enregistrées dans le fichier",
  "live-linked to file": "lié en direct au fichier",
  "Saved into the linked file": "Enregistré dans le fichier lié",
  "Registered elsewhere": "Enregistré ailleurs",
  "Browser copy — changes stay in the browser until you use File → Save database":
    "Copie navigateur — les changements restent dans le navigateur jusqu'à ce que vous utilisiez Fichier → Enregistrer la base de données",
  "Browser copy — use File → Save database to export it":
    "Copie navigateur — utilisez Fichier → Enregistrer la base de données pour l'exporter",
  "Reset example": "Réinitialiser l'exemple",
  "Reset the example database to its original seeded state?": "Réinitialiser la base d'exemple à son état initial ?",
  "Example database reset": "Base d'exemple réinitialisée",
  "Stored database to attach": "Base stockée à attacher",

  // ===================== schema / DDL ops =====================
  "Create table": "Créer une table",
  "Create table from selection": "Créer une table à partir de la sélection",
  "Create foreign key": "Créer une clé étrangère",
  "Create index": "Créer un index",
  "Create trigger": "Créer un déclencheur",
  "New table": "Nouvelle table",
  "New table name": "Nom de la nouvelle table",
  "Table name": "Nom de la table",
  "Table name required": "Nom de la table requis",
  "Table renamed": "Table renommée",
  "Table dropped": "Table supprimée",
  "Rename table": "Renommer la table",
  "Rename table to": "Renommer la table en",
  "Drop": "Supprimer",
  "Drop table": "Supprimer la table",
  "Drop view": "Supprimer la vue",
  "Drop column": "Supprimer la colonne",
  "Drop index": "Supprimer l'index",
  "Drop trigger": "Supprimer le déclencheur",
  "Add column": "Ajouter une colonne",
  "Column added": "Colonne ajoutée",
  "Column dropped": "Colonne supprimée",
  "Column renamed": "Colonne renommée",
  "Column name": "Nom de la colonne",
  "Column name required": "Nom de la colonne requis",
  "Column type changed": "Type de colonne modifié",
  "Change column type": "Changer le type de colonne",
  "Change type": "Changer le type",
  "Change type (rebuilds table)": "Changer le type (reconstruit la table)",
  "Rename column": "Renommer la colonne",
  "Default value (optional)": "Valeur par défaut (facultatif)",
  "Primary key (INTEGER → autoincrement rowid)": "Clé primaire (INTEGER → rowid auto-incrémenté)",
  "Add index": "Ajouter un index",
  "Index created": "Index créé",
  "Index dropped": "Index supprimé",
  "Index name": "Nom de l'index",
  "Indexes": "Index",
  "No indexes on this table.": "Aucun index sur cette table.",
  "Add trigger": "Ajouter un déclencheur",
  "Trigger created": "Déclencheur créé",
  "Trigger dropped": "Déclencheur supprimé",
  "Trigger name": "Nom du déclencheur",
  "Triggers": "Déclencheurs",
  "View trigger SQL": "Voir le SQL du déclencheur",
  "No triggers — SQL that runs automatically when rows change.": "Aucun déclencheur — du SQL exécuté automatiquement quand des lignes changent.",
  "Body — statements to run (use NEW.col / OLD.col)": "Corps — instructions à exécuter (utilisez NEW.col / OLD.col)",
  "On event": "Sur événement",
  "When": "Quand",
  "Runs automatically on every matching change, no matter where": "S'exécute automatiquement à chaque changement correspondant, où qu'il soit",
  "Foreign key created": "Clé étrangère créée",
  "Foreign keys": "Clés étrangères",
  "Can't reference a view.": "Impossible de référencer une vue.",
  "SQLite can't change a type in place — the table is rebuilt": "SQLite ne peut pas changer un type sur place — la table est reconstruite",
  "SQLite note: adding a NOT NULL column to a table that already has rows requires a default value.":
    "Note SQLite : ajouter une colonne NOT NULL à une table qui contient déjà des lignes nécessite une valeur par défaut.",
  "Drag to another column to create a foreign key": "Glissez vers une autre colonne pour créer une clé étrangère",

  // ===================== diagram / notes / legend =====================
  "Tables": "Tables",
  "Save the current arrangement": "Enregistrer la disposition actuelle",
  "Re-arrange tables": "Réorganiser les tables",
  "Auto-layout": "Disposition auto",
  "Fit & center": "Ajuster et centrer",
  "Fit": "Ajuster",
  "Zoom": "Zoom",
  "Download diagram as SVG": "Télécharger le diagramme en SVG",
  "Download diagram as PNG": "Télécharger le diagramme en PNG",
  "No tables to diagram yet.": "Aucune table à représenter pour l'instant.",
  "Save layout": "Enregistrer la disposition",
  "Layout name": "Nom de la disposition",
  "Layout name required": "Nom de la disposition requis",
  "Layout saved": "Disposition enregistrée",
  "Layout updated": "Disposition mise à jour",
  "Overwrite layout": "Écraser la disposition",
  "Overwrite with current": "Écraser avec l'actuelle",
  "Delete this layout": "Supprimer cette disposition",
  "Delete all": "Tout supprimer",
  "Delete layouts": "Supprimer les dispositions",
  "All layouts deleted": "Toutes les dispositions supprimées",
  "Nothing to save": "Rien à enregistrer",
  "Apply": "Appliquer",
  "Legend": "Légende",
  "Legend entry": "Entrée de légende",
  "Remove legend entry": "Supprimer l'entrée de légende",
  "Add sticky note": "Ajouter une note",
  "Delete note": "Supprimer la note",
  "Delete notes": "Supprimer les notes",
  "Delete every sticky note": "Supprimer toutes les notes",
  "Write a note…": "Écrire une note…",
  "Drops an editable sticky note onto the diagram canvas": "Dépose une note modifiable sur le canevas du diagramme",
  "Name what each color means, then tag tables with a color from their editor (Tables panel).":
    "Nommez la signification de chaque couleur, puis étiquetez les tables avec une couleur depuis leur éditeur (panneau Tables).",
  "Click to cycle the color": "Cliquez pour changer de couleur",
  "Click to cycle the tag color": "Cliquez pour changer la couleur de l'étiquette",
  "No tag": "Aucune étiquette",
  "No tables tagged yet.": "Aucune table étiquetée pour l'instant.",
  "No tables yet.": "Aucune table pour l'instant.",
  "Tagged tables": "Tables étiquetées",
  "Tag": "Étiquette",
  "Untag": "Retirer l'étiquette",
  "what this color means": "ce que signifie cette couleur",
  "leave blank for none": "laisser vide pour aucune",

  // ===================== maintenance / backups =====================
  "Maintenance": "Maintenance",
  "Backups": "Sauvegardes",
  "Check database integrity": "Vérifier l'intégrité de la base",
  "Check": "Vérifier",
  "Rebuild the file, reclaim free space": "Reconstruire le fichier, récupérer l'espace libre",
  "Auto-backups — click to manage": "Sauvegardes auto — cliquez pour gérer",

  // ===================== record / row viewer =====================
  "Row": "Ligne",
  "Record card + related rows": "Fiche d'enregistrement + lignes liées",
  "Card": "Fiche",
  "Raw JSON": "JSON brut",
  "Close": "Fermer",
  "Click a row in a result grid or the Browse view to inspect it and follow its foreign-key relations.":
    "Cliquez sur une ligne dans une grille de résultats ou dans la vue Parcourir pour l'inspecter et suivre ses relations de clé étrangère.",

  // ===================== settings =====================
  "Language": "Langue",
  "Theme": "Thème",
  "Dark": "Sombre",
  "Light": "Clair",
  "Auto-capitalize SQL keywords": "Mettre en majuscule les mots-clés SQL",
  "Tab width": "Largeur de tabulation",
  "Word wrap (hides line numbers)": "Retour à la ligne (masque les numéros de ligne)",
  "Autocomplete": "Autocomplétion",
  "Autocomplete as you type": "Autocomplétion pendant la saisie",
  "Autocomplete after": "Autocomplétion après",
  "Editor font size": "Taille de police de l'éditeur",
  "Format SQL automatically on Run": "Formater le SQL automatiquement à l'exécution",
  "Query & safety": "Requête et sécurité",
  "Confirm destructive statements": "Confirmer les instructions destructrices",
  "Read-only mode (block all writes)": "Mode lecture seule (bloquer toutes les écritures)",
  "Read-only mode is on (see Settings).": "Le mode lecture seule est activé (voir Paramètres).",
  "Preview writes before applying": "Prévisualiser les écritures avant d'appliquer",
  "Preview writes": "Prévisualiser les écritures",
  "Browse page size": "Taille de page (Parcourir)",
  "Max rows shown per result": "Lignes max affichées par résultat",
  "Record query history": "Enregistrer l'historique des requêtes",
  "History entries shown": "Entrées d'historique affichées",
  "Clear all": "Tout effacer",
  "Clear all query history?": "Effacer tout l'historique des requêtes ?",
  "History cleared": "Historique effacé",
  "Display": "Présentation",
  "Show NULL as": "Afficher NULL comme",
  "Truncate long cells": "Tronquer les cellules longues",
  "Show status bar": "Afficher la barre d'état",
  "Density": "Densité",
  "Data": "Données",
  "CSV delimiter": "Délimiteur CSV",
  "CSV header row": "Ligne d'en-tête CSV",
  "Range-copy separator": "Séparateur de copie de plage",
  "Auto-backup before destructive SQL (keeps last 5)": "Sauvegarde auto avant SQL destructeur (garde les 5 dernières)",
  "Advanced auto-link (match columns by type & values)": "Lien auto avancé (associer les colonnes par type et valeurs)",
  "SequenceLab runs fully offline. Databases are stored as real .db files in the app's data/ folder; settings live in this browser.":
    "SequenceLab fonctionne entièrement hors ligne. Les bases de données sont stockées comme de vrais fichiers .db dans le dossier data/ de l'application ; les paramètres restent dans ce navigateur.",
  "Reset defaults": "Réinitialiser",
  "Reset": "Réinitialiser",
  "Done": "Terminé",
  // settings option values
  "1 character": "1 caractère",
  "2 characters": "2 caractères",
  "3 characters": "3 caractères",
  "2 spaces": "2 espaces",
  "4 spaces": "4 espaces",
  "80 chars": "80 caractères",
  "200 chars": "200 caractères",
  "500 chars": "500 caractères",
  "unlimited": "illimité",
  "empty cell": "cellule vide",
  "off": "désactivé",
  "comma ,": "virgule ,",
  "semicolon ;": "point-virgule ;",
  "tab": "tabulation",
  "comfortable": "confortable",
  "compact": "compact",
  "Tab": "Tabulation",
  "Comma": "Virgule",
  "Semicolon": "Point-virgule",
  "Pipe": "Barre verticale",

  // ===================== common buttons / words =====================
  "Cancel": "Annuler",
  "Confirm": "Confirmer",
  "Create": "Créer",
  "Insert": "Insérer",
  "Delete": "Supprimer",
  "Rename": "Renommer",
  "Save": "Enregistrer",
  "Write": "Écrire",
  "Overwrite": "Écraser",
  "Prev": "Préc.",
  "Next": "Suiv.",
  "Other": "Autre",
  "Title": "Titre",
  "Error": "Erreur",
  "Name required": "Nom requis",
  "Enter a name": "Saisissez un nom",
  "Type": "Type",
  "foreign key": "clé étrangère",
  "primary key": "clé primaire",
  "full scan": "parcours complet",
  "read-only (no rowid)": "lecture seule (pas de rowid)",
  "⛔ Filter failed": "⛔ Échec du filtre",
  "⛔ Query failed": "⛔ Échec de la requête",

  // ===================== interpolated (used via I18N.t) =====================
  "Query #{0}": "Requête nº {0}",
  "Created {0} ({1} rows)": "{0} créée ({1} lignes)",
  "Copied {0} cells ({1})": "{0} cellule(s) copiée(s) ({1})",
  "Go to {0}": "Aller à {0}",
  "Add row to {0}": "Ajouter une ligne à {0}",
  "Schema — {0}": "Schéma — {0}",
  "Delete {0} selected rows?": "Supprimer les {0} lignes sélectionnées ?",
  "{0} rows": "{0} lignes",
  "{0} tables placed": "{0} tables placées",
  "Delete all {0} saved layouts?": "Supprimer les {0} dispositions enregistrées ?",
  "Delete all ({0})": "Tout supprimer ({0})",
  "Layout \"{0}\" applied": "Disposition « {0} » appliquée",
  "Layout \"{0}\" deleted": "Disposition « {0} » supprimée",
  "Overwrite layout \"{0}\"?": "Écraser la disposition « {0} » ?",
  "Replaced {0} occurrences": "{0} occurrence(s) remplacée(s)",
  "About to run {0} destructive statement(s):\n\n{1}\n\nContinue?":
    "Sur le point d'exécuter {0} instruction(s) destructrice(s) :\n\n{1}\n\nContinuer ?",
  "Stats · {0}": "Statistiques · {0}",
  "Created {0}": "{0} créée",
  "Go to {0}.{1} = {2}": "Aller à {0}.{1} = {2}",
  "Imported {0} row(s) into {1}": "{0} ligne(s) importée(s) dans {1}",
  "Attached as {0}": "Attaché comme {0}",
  "Replace {0} with this backup?\n(The current state is backed up first.)":
    "Remplacer {0} par cette sauvegarde ?\n(L'état actuel est sauvegardé au préalable.)",
  "Restore backup": "Restaurer la sauvegarde",
  "Restore": "Restaurer",
  "Database tools — {0}": "Outils de base de données — {0}",
  "Delete snippet \"{0}\"?": "Supprimer l'extrait « {0} » ?",
  "Delete snippet": "Supprimer l'extrait",
  "No saved snippets.<br>Write SQL, then click ＋.<br><br>Tip: <code>${name}</code> placeholders prompt on insert, <code>${cursor}</code> sets the caret.":
    "Aucun extrait enregistré.<br>Écrivez du SQL, puis cliquez sur ＋.<br><br>Astuce : les espaces réservés <code>${name}</code> demandent une valeur à l'insertion, <code>${cursor}</code> place le curseur.",

  // ===================== diagram.js =====================
  "Table created": "Table créée",
  "PNG export failed": "Échec de l'export PNG",
  "{0} added · {1} deleted · {2} edited": "{0} ajoutée(s) · {1} supprimée(s) · {2} modifiée(s)",
  "No saved layouts yet.<br>Arrange the tables, then press ＋ above to keep the arrangement under a name.":
    "Aucune disposition enregistrée pour l'instant.<br>Disposez les tables, puis appuyez sur ＋ ci-dessus pour conserver l'agencement sous un nom.",
  "Delete all {0} sticky notes?": "Supprimer les {0} notes ?",
  "Delete {0} notes of this color?": "Supprimer les {0} notes de cette couleur ?",
  "Drop index \"{0}\"?": "Supprimer l'index « {0} » ?",
  "Trigger: {0}": "Déclencheur : {0}",
  "Drop trigger \"{0}\"?": "Supprimer le déclencheur « {0} » ?",
  "Add trigger on {0}": "Ajouter un déclencheur sur {0}",
  "Add index on {0}": "Ajouter un index sur {0}",
  "Add column to {0}": "Ajouter une colonne à {0}",
  "Drop column \"{0}\" from {1}? This deletes its data.": "Supprimer la colonne « {0} » de {1} ? Cela supprime ses données.",
  "Select a table to edit its columns,<br>rename it, or drop it.":
    "Sélectionnez une table pour modifier ses colonnes,<br>la renommer ou la supprimer.",
  "No saved filters yet.<br>Browse a table with a WHERE filter, then press ＋ above to keep it.":
    "Aucun filtre enregistré pour l'instant.<br>Parcourez une table avec un filtre WHERE, puis appuyez sur ＋ ci-dessus pour le conserver.",

  // ===================== syntax reference (syntax.js) =====================
  // labels & headings (SQL keywords / example code stay English)
  "Example": "Exemple",
  "All functions": "Toutes les fonctions",
  "Comment": "Commentaire",
  "Load this example into the editor": "Charger cet exemple dans l'éditeur",
  "Click to load into the editor": "Cliquez pour charger dans l'éditeur",
  "Aggregate": "Agrégation",
  "Core scalar": "Scalaires de base",
  "Date & time": "Date et heure",
  "Window": "Fenêtre",
  // function descriptions (shown as tooltips)
  "count(*) or count(x) — number of rows / non-null values": "count(*) ou count(x) — nombre de lignes / valeurs non nulles",
  "sum of values (NULL if no rows)": "somme des valeurs (NULL si aucune ligne)",
  "like sum() but always returns a float, 0.0 for no rows": "comme sum() mais retourne toujours un flottant, 0.0 si aucune ligne",
  "average of non-null values": "moyenne des valeurs non nulles",
  "minimum value": "valeur minimale",
  "maximum value": "valeur maximale",
  "group_concat(x [, sep]) — join values into a string": "group_concat(x [, sép]) — joint les valeurs en une chaîne",
  "absolute value": "valeur absolue",
  "first non-null argument": "premier argument non nul",
  "ifnull(a, b) — a if not null, else b": "ifnull(a, b) — a si non nul, sinon b",
  "nullif(a, b) — NULL if a = b, else a": "nullif(a, b) — NULL si a = b, sinon a",
  "iif(cond, a, b) — ternary expression": "iif(cond, a, b) — expression ternaire",
  "length of a string / blob": "longueur d'une chaîne / d'un blob",
  "lowercase": "minuscules",
  "uppercase": "majuscules",
  "trim(x [, chars]) — strip leading & trailing chars": "trim(x [, car]) — retire les caractères en début et fin",
  "strip leading chars": "retire les caractères en début",
  "strip trailing chars": "retire les caractères en fin",
  "substr(x, start [, len]) — substring (1-based)": "substr(x, début [, long]) — sous-chaîne (base 1)",
  "replace(x, find, with)": "replace(x, chercher, remplacer)",
  "instr(x, sub) — 1-based position of sub, or 0": "instr(x, sous) — position (base 1) de sous, ou 0",
  "printf(fmt, ...) — formatted string": "printf(fmt, ...) — chaîne formatée",
  "alias of printf()": "alias de printf()",
  "hexadecimal representation of a blob": "représentation hexadécimale d'un blob",
  "SQL-literal-quoted form of a value": "forme d'une valeur entre guillemets SQL",
  "type name: null/integer/real/text/blob": "nom de type : null/integer/real/text/blob",
  "round(x [, digits])": "round(x [, décimales])",
  "-1, 0 or 1": "-1, 0 ou 1",
  "random integer": "entier aléatoire",
  "char(n, ...) — characters from code points": "char(n, ...) — caractères à partir de points de code",
  "code point of the first character": "point de code du premier caractère",
  "rowid of the most recent insert": "rowid de la dernière insertion",
  "rows changed by the last statement": "lignes modifiées par la dernière instruction",
  "date(time [, modifiers]) — YYYY-MM-DD": "date(heure [, modificateurs]) — AAAA-MM-JJ",
  "datetime(...) — YYYY-MM-DD HH:MM:SS": "datetime(...) — AAAA-MM-JJ HH:MM:SS",
  "Julian day number": "numéro de jour julien",
  "seconds since 1970-01-01": "secondes depuis 1970-01-01",
  "strftime(fmt, time [, mods]) — custom format": "strftime(fmt, heure [, mods]) — format personnalisé",
  "ceiling": "plafond (arrondi supérieur)",
  "floor": "plancher (arrondi inférieur)",
  "truncate toward zero": "tronque vers zéro",
  "natural log": "logarithme népérien",
  "square root": "racine carrée",
  "sine": "sinus",
  "cosine": "cosinus",
  "tangent": "tangente",
  "degrees → radians": "degrés → radians",
  "radians → degrees": "radians → degrés",
  "sequential number within the partition": "numéro séquentiel dans la partition",
  "rank with gaps on ties": "rang avec sauts en cas d'égalité",
  "rank without gaps": "rang sans saut",
  "ntile(n) — distribute rows into n buckets": "ntile(n) — répartit les lignes en n groupes",
  "lag(x [, off [, def]]) — previous row's value": "lag(x [, déc [, déf]]) — valeur de la ligne précédente",
  "lead(x [, off [, def]]) — next row's value": "lead(x [, déc [, déf]]) — valeur de la ligne suivante",
  "first value in the window frame": "première valeur dans la fenêtre",
  "last value in the window frame": "dernière valeur dans la fenêtre",
  "relative rank 0..1": "rang relatif 0..1",
  "cumulative distribution": "distribution cumulative",
  "validate & minify a JSON string": "valide et minifie une chaîne JSON",
  "build a JSON array": "construit un tableau JSON",
  "json_object(k, v, ...) — build a JSON object": "json_object(c, v, ...) — construit un objet JSON",
  "json_extract(j, path) — read a value": "json_extract(j, chemin) — lit une valeur",
  "set a value at a path": "définit une valeur à un chemin",
  "insert a value at a path": "insère une valeur à un chemin",
  "replace a value at a path": "remplace une valeur à un chemin",
  "type of a JSON value": "type d'une valeur JSON",
  "1 if the argument is valid JSON": "1 si l'argument est un JSON valide",
  "length of a JSON array": "longueur d'un tableau JSON",
  "aggregate values into a JSON array": "agrège des valeurs en un tableau JSON",
  "aggregate pairs into a JSON object": "agrège des paires en un objet JSON",

  // ===================== errors (api.js) =====================
  // friendly explanations shown in the error card
  "The table you referenced doesn't exist in this database. Check the spelling, or look at the schema sidebar to see which tables are available.":
    "La table que vous avez référencée n'existe pas dans cette base. Vérifiez l'orthographe, ou consultez la barre latérale du schéma pour voir les tables disponibles.",
  "One of the column names doesn't exist. Make sure it's spelled correctly and belongs to the table you're querying. Expand the table in the sidebar to see its columns.":
    "L'un des noms de colonne n'existe pas. Vérifiez l'orthographe et qu'il appartient à la table interrogée. Dépliez la table dans la barre latérale pour voir ses colonnes.",
  "SQLite couldn't understand the statement. This is usually a typo, a missing comma, an unclosed quote/parenthesis, or a misplaced keyword near the highlighted spot.":
    "SQLite n'a pas compris l'instruction. Il s'agit généralement d'une faute de frappe, d'une virgule manquante, d'un guillemet/d'une parenthèse non fermé(e), ou d'un mot-clé mal placé près de l'endroit surligné.",
  "You're trying to insert or update a value that must be unique, but that value already exists in the table (for example a duplicate id or email).":
    "Vous essayez d'insérer ou de mettre à jour une valeur qui doit être unique, mais cette valeur existe déjà dans la table (par exemple un id ou un e-mail en double).",
  "A column that requires a value was left empty. Provide a value for every NOT NULL column.":
    "Une colonne qui exige une valeur a été laissée vide. Fournissez une valeur pour chaque colonne NOT NULL.",
  "This row references another row that doesn't exist (or you're deleting a row other rows still point to). Check the related table.":
    "Cette ligne référence une autre ligne qui n'existe pas (ou vous supprimez une ligne vers laquelle d'autres lignes pointent encore). Vérifiez la table liée.",
  "A value doesn't match the column's expected type — for example putting text where a number/integer primary key is expected.":
    "Une valeur ne correspond pas au type attendu de la colonne — par exemple du texte là où un nombre / une clé primaire entière est attendu.",
  "The statement looks unfinished. You may be missing a closing quote, parenthesis, or the rest of the clause.":
    "L'instruction semble incomplète. Il manque peut-être un guillemet fermant, une parenthèse, ou le reste de la clause.",
  "Two joined tables share this column name. Prefix it with the table name, e.g. users.id instead of just id.":
    "Deux tables jointes partagent ce nom de colonne. Préfixez-le avec le nom de la table, ex. users.id au lieu de id.",
  "An object with this name already exists. Use a different name, or drop the existing one first (CREATE ... IF NOT EXISTS skips it).":
    "Un objet portant ce nom existe déjà. Utilisez un autre nom, ou supprimez d'abord l'existant (CREATE ... IF NOT EXISTS l'ignore).",
  "You're inserting into a column that doesn't exist on this table. Check the column list against the schema sidebar.":
    "Vous insérez dans une colonne qui n'existe pas sur cette table. Comparez la liste des colonnes avec la barre latérale du schéma.",
  "The query was cancelled before it finished.": "La requête a été annulée avant la fin.",
  "SQLite reported an error while running this statement. Read the raw message above for the specific cause.":
    "SQLite a signalé une erreur lors de l'exécution de cette instruction. Lisez le message brut ci-dessus pour la cause précise.",
  // plain error messages shown as toasts
  "That file is not a valid SQLite database.": "Ce fichier n'est pas une base de données SQLite valide.",
  "In the browser edition, use the file picker to import a .db file.": "Dans l'édition navigateur, utilisez le sélecteur de fichiers pour importer un fichier .db.",
  "Live file links need the File System Access API (Chrome/Edge). Use Import instead.":
    "Les liens de fichier en direct nécessitent l'API File System Access (Chrome/Edge). Utilisez Importer à la place.",
  "This database isn't linked to a file — use Download instead.": "Cette base n'est pas liée à un fichier — utilisez Télécharger à la place.",
  "The browser refused write access to the linked file.": "Le navigateur a refusé l'accès en écriture au fichier lié.",
  "Invalid journal mode.": "Mode de journalisation invalide.",
  "Invalid auto_vacuum value.": "Valeur auto_vacuum invalide.",
  "This pragma can't be changed here.": "Ce pragma ne peut pas être modifié ici.",

  // ===================== fixes / additions (round 2) =====================
  // "snippet" stays "snippet" in French (these override the earlier "extrait" entries)
  "Snippets": "Snippets",
  "Saved snippets": "Snippets enregistrés",
  "Save current editor as snippet": "Enregistrer l'éditeur actuel comme snippet",
  "Save snippet": "Enregistrer le snippet",
  "Save as snippet": "Enregistrer comme snippet",
  "Save as snippet…": "Enregistrer comme snippet…",
  "No saved snippets.": "Aucun snippet enregistré.",
  "Delete snippet": "Supprimer le snippet",
  "Delete snippet \"{0}\"?": "Supprimer le snippet « {0} » ?",
  "No saved snippets.<br>Write SQL, then click ＋.<br><br>Tip: <code>${name}</code> placeholders prompt on insert, <code>${cursor}</code> sets the caret.":
    "Aucun snippet enregistré.<br>Écrivez du SQL, puis cliquez sur ＋.<br><br>Astuce : les espaces réservés <code>${name}</code> demandent une valeur à l'insertion, <code>${cursor}</code> place le curseur.",

  // tab titles / row counts (localized at render time)
  "Result ({0})": "Résultat ({0})",
  "Preview ({0})": "Aperçu ({0})",
  "rows": "lignes",
  "showing first {0}": "affichage des {0} premières",
  "{0} rows · showing {1}–{2}": "{0} lignes · affichage {1}–{2}",
  "Showing first {0} rows.": "Affichage des {0} premières lignes.",
  "{0} tables will be saved at their current positions.": "{0} tables seront enregistrées à leur position actuelle.",

  // files panel header
  "Browser storage (IndexedDB)": "Stockage du navigateur (IndexedDB)",

  // open-database dialog
  "Import copies the file into the browser's storage — the original on disk is never touched; get the edited copy back with File → Save database.":
    "Importer copie le fichier dans le stockage du navigateur — l'original sur le disque n'est jamais modifié ; récupérez la copie modifiée via Fichier → Enregistrer la base de données.",
  "instead keeps a connection to the real file: every change is saved straight back into it (you'll be asked for permission once).":
    "garde plutôt une connexion au vrai fichier : chaque modification y est enregistrée directement (l'autorisation est demandée une fois).",
  "Live file links (saving straight back into the real file) need Chrome or Edge.":
    "Les liens de fichier en direct (enregistrement direct dans le vrai fichier) nécessitent Chrome ou Edge.",

  // theme names + subtitles
  "Auto": "Auto",
  "System": "Système",
  "follows your OS": "suit votre système",
  "Graphite & Amber": "Graphite et Ambre",
  "Orchid": "Orchidée",
  "Gray": "Gris",
  "Paper": "Papier",
  "blue": "bleu",
  "warm": "chaud",
  "pink/purple": "rose/violet",
  "discord-style": "style Discord",
  "cool gray": "gris froid",
  "warm light": "clair chaud",

  // chart type selector
  "bar": "barres",
  "line": "courbe",
  "area": "aires",
  "scatter": "nuage de points",
  "pie": "camembert",
  "histogram": "histogramme",

  // ===================== onboarding wizard + guided tour =====================
  "Back": "Retour",
  "Pick a theme": "Choisissez un thème",
  "You can change this any time in Settings.": "Vous pourrez le changer à tout moment dans les Paramètres.",
  "Have a look around": "Faites le tour",
  "Take a quick guided tour of every panel, or jump straight in — you can replay the tour any time from the Help menu.":
    "Faites une visite guidée rapide de chaque panneau, ou lancez-vous directement — vous pouvez rejouer la visite à tout moment depuis le menu Aide.",
  "Skip": "Passer",
  "Take the tour": "Faire la visite",
  "Skip tour": "Passer la visite",
  // tour step titles
  "The side rail": "La barre latérale d'icônes",
  "Syntax reference": "Référence de syntaxe",
  // tour step bodies
  "These icons switch between the three workspaces — Editor, Browse and Diagram — and their sub-panels. Let's walk through each.":
    "Ces icônes basculent entre les trois espaces de travail — Éditeur, Parcourir et Diagramme — et leurs sous-panneaux. Passons-les en revue un par un.",
  "Write and run SQL. You get syntax highlighting, autocomplete, keyword auto-capitalize, one-click formatting, and multiple draggable query tabs.":
    "Écrivez et exécutez du SQL. Vous bénéficiez de la coloration syntaxique, de l'autocomplétion, de la mise en majuscule des mots-clés, du formatage en un clic et de plusieurs onglets de requête déplaçables.",
  "Run everything, just the selection, or only the statement under the caret — the ▾ menu also explains the query plan. Shortcut: Ctrl+Enter.":
    "Exécutez tout, seulement la sélection, ou uniquement l'instruction sous le curseur — le menu ▾ explique aussi le plan de requête. Raccourci : Ctrl+Entrée.",
  "Your databases, stored as real .db files in the browser. Create, open/import a .db, or live-link a file on disk so edits save straight back.":
    "Vos bases de données, stockées comme de vrais fichiers .db dans le navigateur. Créez, ouvrez/importez un .db, ou liez en direct un fichier du disque pour que les modifications y soient réenregistrées.",
  "Save reusable SQL. Use ${name} placeholders that prompt on insert and ${cursor} to drop the caret where you need it.":
    "Enregistrez du SQL réutilisable. Utilisez les espaces réservés ${name} qui demandent une valeur à l'insertion et ${cursor} pour placer le curseur où vous voulez.",
  "Every query you run is logged with its status and timing — click one to load it back into the editor.":
    "Chaque requête exécutée est enregistrée avec son statut et sa durée — cliquez sur l'une d'elles pour la recharger dans l'éditeur.",
  "A clickable cheat-sheet for every SQL statement plus a grouped function reference. Click an example to drop it into the editor.":
    "Un aide-mémoire cliquable pour chaque instruction SQL, plus une référence de fonctions groupées. Cliquez sur un exemple pour l'insérer dans l'éditeur.",
  "A spreadsheet-style view of any table: edit cells inline, sort, per-column filters, range-select & copy, add/clone/delete rows, and export.":
    "Une vue façon tableur de n'importe quelle table : modifiez les cellules en ligne, triez, filtrez par colonne, sélectionnez et copiez des plages, ajoutez/clonez/supprimez des lignes, et exportez.",
  "Keep table + WHERE filters you use often and reapply them in one click.":
    "Conservez les filtres table + WHERE que vous utilisez souvent et réappliquez-les en un clic.",
  "An ER diagram of your schema: drag the cards, draw a foreign key by dragging one column onto another, auto-layout, and export to PNG or SVG.":
    "Un diagramme ER de votre schéma : déplacez les cartes, créez une clé étrangère en glissant une colonne sur une autre, disposition automatique, et export en PNG ou SVG.",
  "Save several named arrangements of the diagram and switch between them.":
    "Enregistrez plusieurs agencements nommés du diagramme et basculez entre eux.",
  "Drop sticky notes on the canvas and tag tables with colors, with a legend explaining what each color means.":
    "Déposez des notes sur le canevas et étiquetez les tables avec des couleurs, avec une légende expliquant la signification de chaque couleur.",
  "Language, theme, editor behavior, safety (read-only, confirm destructive, preview writes), display and data options all live here.":
    "Langue, thème, comportement de l'éditeur, sécurité (lecture seule, confirmation des actions destructrices, prévisualisation des écritures), options d'affichage et de données se trouvent ici.",

  // ===================== debug section =====================
  "Debug": "Débogage",
  "Replay the welcome tour": "Rejouer la visite de bienvenue",
  "Replay": "Rejouer",
  "Service worker & caches": "Service worker et caches",
  "Clear & reload": "Vider et recharger",
  "Reset everything (databases, settings, tutorial)": "Tout réinitialiser (bases, paramètres, tutoriel)",
  "Clear everything": "Tout réinitialiser",
  "Delete ALL databases, settings and cached data, then reload? This cannot be undone.":
    "Supprimer TOUTES les bases de données, paramètres et données en cache, puis recharger ? Cette action est irréversible.",
  "Auto-link diagnostics": "Diagnostic des liens auto",
  "Show": "Afficher",
  "Advanced auto-link is on — related-name columns are matched by type and values.":
    "Le lien auto avancé est activé — les colonnes aux noms apparentés sont associées par type et valeurs.",
  "Advanced auto-link is off — related-name rows show what would link once you enable it in Settings.":
    "Le lien auto avancé est désactivé — les lignes « nom apparenté » montrent ce qui serait lié une fois activé dans les Paramètres.",
  "Advanced auto-link is off — related-name rows below would link once you enable it.":
    "Le lien auto avancé est désactivé — les lignes « nom apparenté » ci-dessous seraient liées une fois activé.",
  "Auto-link is currently off — turn it on to propose these links.":
    "Le lien auto est actuellement désactivé — activez-le pour proposer ces liens.",
  "Needs Advanced": "Nécessite Avancé",
  "would link with Advanced on": "se lierait avec le mode Avancé activé",
  "Turn on Auto-link": "Activer le lien auto",
  "Enable Advanced auto-link": "Activer le lien auto avancé",
  "Auto-link enabled": "Lien auto activé",
  "Advanced auto-link enabled": "Lien auto avancé activé",
  "No reference-looking columns found in this database.": "Aucune colonne ressemblant à une référence trouvée dans cette base.",
  "Target": "Cible",
  "Rule": "Règle",
  "Values": "Valeurs",
  "Verdict": "Verdict",
  "name (_id)": "nom (_id)",
  "related name": "nom apparenté",
  "Would link": "Lierait",
  "Rejected": "Rejeté",
  "Skipped": "Ignoré",
  "already a real foreign key": "déjà une vraie clé étrangère",
  "no matching table / id column": "aucune table correspondante / colonne id",
  "matched by name": "associé par le nom",
  "type mismatch ({0} vs {1})": "types incompatibles ({0} vs {1})",
  "no rows to verify values": "aucune ligne pour vérifier les valeurs",
  "type + values match": "type et valeurs correspondent",
  "only {0}% of values match": "seulement {0}% des valeurs correspondent",

  // ===================== diagram auto-link =====================
  "Auto-link": "Lien auto",
  "Automatically create foreign keys for columns with related names (e.g. user_id → users.id)":
    "Créer automatiquement des clés étrangères pour les colonnes aux noms apparentés (ex. user_id → users.id)",
  "Confirm auto-links": "Confirmer les liens auto",
  "Create the proposed foreign keys": "Créer les clés étrangères proposées",
  "Click to remove this proposed link": "Cliquez pour retirer ce lien proposé",
  "auto-link": "lien auto",
  "No auto-links to confirm.": "Aucun lien auto à confirmer.",
  "Create {0} foreign key(s) from the proposed auto-links?": "Créer {0} clé(s) étrangère(s) à partir des liens auto proposés ?",
  "Created {0} foreign key(s)": "{0} clé(s) étrangère(s) créée(s)",
  "Created {0} of {1} — {2} failed": "{0} sur {1} créées — {2} en échec",

  // ===================== version / what's new / update log =====================
  "Update log": "Journal des mises à jour",
  "What's new": "Nouveautés",
  "You're up to date.": "Vous êtes à jour.",
  "Smarter ER auto-layout: groups linked tables, sizes around each table, and spaces them so links are easier to read":
    "Disposition ER plus intelligente : regroupe les tables liées, s'adapte à la taille de chaque table et les espace pour des liens plus lisibles",
  "Version history — a “What’s new” popup after each update, and an update log in Settings":
    "Historique des versions — une fenêtre « Nouveautés » après chaque mise à jour, et un journal des mises à jour dans les Paramètres",
  "Auto-link: infer foreign keys from related column names (basic, plus an advanced mode that matches by type & values) and confirm them in the Diagram":
    "Lien auto : déduit les clés étrangères à partir des noms de colonnes apparentés (mode de base, plus un mode avancé qui associe par type et valeurs) et les confirme dans le Diagramme",
  "Auto-link diagnostics in Settings → Debug": "Diagnostic des liens auto dans Paramètres → Débogage",
  "Open .sq3 / .s3db SQLite files": "Ouvrir les fichiers SQLite .sq3 / .s3db",
  "Guided tour on first launch (replay it any time from Help)":
    "Visite guidée au premier lancement (rejouable à tout moment depuis Aide)",
  "System theme that follows your OS (dark → Nocturne, light → Paper)":
    "Thème Système qui suit votre OS (sombre → Nocturne, clair → Papier)",
  "Debug tools: replay the tour, clear caches, reset everything":
    "Outils de débogage : rejouer la visite, vider les caches, tout réinitialiser",
  "Bilingual interface — switch between English and Français in Settings":
    "Interface bilingue — basculer entre English et Français dans les Paramètres",
  // ===================== console + v5 (added) =====================
  "The table “{0}” doesn't exist in this database. Check the spelling, or open the schema sidebar to see the tables you can query.":
    "La table « {0} » n'existe pas dans cette base de données. Vérifiez l'orthographe, ou ouvrez le panneau de schéma pour voir les tables disponibles.",
  "The table “{0}” has no column named “{1}”. You're writing to a column that doesn't exist on that table — check the column list in the schema sidebar.":
    "La table « {0} » n'a pas de colonne nommée « {1} ». Vous écrivez dans une colonne qui n'existe pas sur cette table — vérifiez la liste des colonnes dans le panneau de schéma.",
  "There's no column named “{0}” in the table(s) you're querying. Check the spelling and that it belongs to the right table — expand the table in the sidebar to see its columns.":
    "Il n'y a pas de colonne nommée « {0} » dans la ou les tables interrogées. Vérifiez l'orthographe et qu'elle appartient à la bonne table — développez la table dans le panneau pour voir ses colonnes.",
  "“{0}” must be unique, but that value already exists in the table. Use a value that isn't already taken (for example a different id or email).":
    "« {0} » doit être unique, mais cette valeur existe déjà dans la table. Utilisez une valeur qui n'est pas déjà prise (par exemple un id ou un e-mail différent).",
  "“{0}” requires a value but was left empty (NULL). Provide a value for every NOT NULL column.":
    "« {0} » exige une valeur mais a été laissée vide (NULL). Fournissez une valeur pour chaque colonne NOT NULL.",
  "A CHECK constraint failed on “{0}”. The value isn't allowed by the rule defined for that column or table — adjust it to satisfy the constraint.":
    "Une contrainte CHECK a échoué sur « {0} ». La valeur n'est pas autorisée par la règle définie pour cette colonne ou cette table — ajustez-la pour satisfaire la contrainte.",
  "There's no SQL function called “{0}”. Check the spelling, or it may be a function SQLite doesn't support.":
    "Il n'existe aucune fonction SQL appelée « {0} ». Vérifiez l'orthographe, ou il peut s'agir d'une fonction non prise en charge par SQLite.",
  "Two of the joined tables share the column “{0}”. Prefix it with its table name, e.g. table.{0}, so SQLite knows which one you mean.":
    "Deux des tables jointes partagent la colonne « {0} ». Préfixez-la avec le nom de sa table, par ex. table.{0}, pour que SQLite sache de laquelle il s'agit.",
  "SQLite got confused near “{0}”. There's likely a typo, a missing comma/quote/parenthesis, or a misplaced keyword right around there.":
    "SQLite s'est perdu près de « {0} ». Il y a probablement une faute de frappe, une virgule/un guillemet/une parenthèse manquante, ou un mot-clé mal placé juste à cet endroit.",
  "“{0}” already exists. Use a different name, or drop the existing one first (CREATE … IF NOT EXISTS skips it).":
    "« {0} » existe déjà. Utilisez un autre nom, ou supprimez d'abord l'existant (CREATE … IF NOT EXISTS l'ignore).",
  "This row points to another row that doesn't exist — or you're deleting/updating a row that other rows still reference. Check the related table and make the referenced row exist first.":
    "Cette ligne renvoie à une autre ligne qui n'existe pas — ou vous supprimez/modifiez une ligne que d'autres lignes référencent encore. Vérifiez la table liée et créez d'abord la ligne référencée.",
  "A value doesn't match the column's expected type — for example putting text where an INTEGER PRIMARY KEY is expected.":
    "Une valeur ne correspond pas au type attendu de la colonne — par exemple du texte là où une clé primaire INTEGER est attendue.",
  "The statement looks unfinished. You're probably missing a closing quote, parenthesis, or the rest of the clause.":
    "L'instruction semble inachevée. Il manque probablement un guillemet fermant, une parenthèse, ou la suite de la clause.",
  "SQLite couldn't parse the statement. This is usually a typo, a missing comma, an unclosed quote/parenthesis, or a misplaced keyword.":
    "SQLite n'a pas pu analyser l'instruction. C'est généralement une faute de frappe, une virgule manquante, un guillemet/une parenthèse non fermé, ou un mot-clé mal placé.",
  "Commands:":
    "Commandes :",
  "show this list":
    "afficher cette liste",
  "clear the console":
    "vider la console",
  "show the app version":
    "afficher la version de l'application",
  "toggle admin mode (debug tools + admin commands)":
    "activer/désactiver le mode admin (outils de débogage + commandes admin)",
  "erase all databases, settings and caches":
    "effacer toutes les bases de données, paramètres et caches",
  "Admin commands:":
    "Commandes admin :",
  "show or hide the Debug section in Settings":
    "afficher ou masquer la section Débogage dans les Paramètres",
  "clear the service worker & caches, then reload":
    "vider le service worker et les caches, puis recharger",
  "replay the welcome tour":
    "rejouer la visite de bienvenue",
  "switch the interface language":
    "changer la langue de l'interface",
  "switch the theme (nocturne, light, system…)":
    "changer le thème (nocturne, light, system…)",
  "reset the bundled example database":
    "réinitialiser la base d'exemple fournie",
  "Admin mode ON — Debug tools are now in Settings, and admin commands are unlocked.":
    "Mode admin ACTIVÉ — les outils de débogage sont maintenant dans les Paramètres, et les commandes admin sont déverrouillées.",
  "Admin mode OFF — Debug tools are hidden again.":
    "Mode admin DÉSACTIVÉ — les outils de débogage sont de nouveau masqués.",
  "Resetting… the page will reload.":
    "Réinitialisation… la page va se recharger.",
  "This will permanently delete ALL databases, settings and cached data. Continue? (y/n)":
    "Cela supprimera définitivement TOUTES les bases de données, paramètres et données en cache. Continuer ? (y/n)",
  "Cancelled.":
    "Annulé.",
  "“{0}” is an admin command. Type admin to unlock it.":
    "« {0} » est une commande admin. Tapez admin pour la déverrouiller.",
  "Debug tools are {0} in Settings.":
    "Les outils de débogage sont {0} dans les Paramètres.",
  "shown":
    "affichés",
  "hidden":
    "masqués",
  "Clearing caches and reloading…":
    "Vidage des caches et rechargement…",
  "Starting the welcome tour…":
    "Démarrage de la visite de bienvenue…",
  "Usage: lang en | fr":
    "Usage : lang en | fr",
  "Language switched.":
    "Langue changée.",
  "Unknown theme. Try: {0}":
    "Thème inconnu. Essayez : {0}",
  "Theme switched.":
    "Thème changé.",
  "Unknown command: {0}. Type help for the list.":
    "Commande inconnue : {0}. Tapez help pour la liste.",
  "SequenceLab console. Type help for commands.":
    "Console SequenceLab. Tapez help pour les commandes.",
  "No activity yet. Errors, query results and events will appear here.":
    "Aucune activité pour l'instant. Les erreurs, résultats de requêtes et événements apparaîtront ici.",
  "Query failed":
    "Échec de la requête",
  "Statement executed successfully.":
    "Instruction exécutée avec succès.",
  "Query ran successfully ({0} statement(s), {1} row(s))":
    "Requête exécutée avec succès ({0} instruction(s), {1} ligne(s))",
  "Query ran successfully ({0} statement(s), {1} row(s) affected)":
    "Requête exécutée avec succès ({0} instruction(s), {1} ligne(s) affectée(s))",
  "Update":
    "Mise à jour",
  "What's new?":
    "Quoi de neuf ?",
  "Logs":
    "Journaux",
  "Commands":
    "Commandes",
  "Open console":
    "Ouvrir la console",
  "Close console":
    "Fermer la console",
  "Clear":
    "Effacer",
  "Type a command — try help":
    "Tapez une commande — essayez help",
  "A console at the bottom of the page (click the status bar): a Logs tab for errors, query results and events, and a Commands tab (try help, clear, reset)":
    "Une console en bas de la page (cliquez sur la barre d'état) : un onglet Journaux pour les erreurs, résultats de requêtes et événements, et un onglet Commandes (essayez admin, clear, reset)",
  "Clearer error messages that name the exact table or column that caused the problem":
    "Des messages d'erreur plus clairs qui nomment la table ou la colonne exacte à l'origine du problème",
  "Column":
    "Colonne",
  "Done in {0} ms":
    "Terminé en {0} ms",

  "close the console": "fermer la console",
  "Password:": "Mot de passe :",
  "Incorrect password.": "Mot de passe incorrect.",
  "show the current database": "afficher la base de données actuelle",
  "switch to another database": "basculer vers une autre base de données",
  "Current database: {0}": "Base de données actuelle : {0}",
  "Usage: use <database>": "Usage : use <base>",
  "No database named “{0}”. Available: {1}": "Aucune base nommée « {0} ». Disponibles : {1}",
  "Switched to {0}.": "Basculé vers {0}.",
  "This row must point to an existing parent row through:":
    "Cette ligne doit pointer vers une ligne parente existante via :",
  "Other rows still reference this row — remove or update them first, or use ON DELETE CASCADE:":
    "D'autres lignes référencent encore cette ligne — supprimez-les ou modifiez-les d'abord, ou utilisez ON DELETE CASCADE :",
  "Usage: run <SQL>": "Usage : run <SQL>",
  "Ran — outcome is in the Logs tab, results in the editor panel.": "Exécuté — le résultat est dans l'onglet Journaux, les résultats dans le panneau de l'éditeur.",
  "Usage: pragma <name> [value]": "Usage : pragma <nom> [valeur]",
  "(no value)": "(aucune valeur)",
  "Usage: eval <javascript>": "Usage : eval <javascript>",
  "run a SQL statement": "exécuter une instruction SQL",
  "read or set a SQLite PRAGMA": "lire ou définir un PRAGMA SQLite",
  "run JavaScript in the app context": "exécuter du JavaScript dans le contexte de l'application",
  "read or change any setting directly": "lire ou modifier directement n'importe quel paramètre",
  "dump a snapshot of internal app state": "afficher un instantané de l'état interne de l'application",
  "Console errors now expand to a detailed explanation, naming the exact table, column or foreign-key link behind them":
    "Les erreurs de la console s'étendent désormais en une explication détaillée, nommant la table, la colonne ou le lien de clé étrangère exact à l'origine du problème",
  "New console commands: run, pragma, db / use and close — run SQL, read or set PRAGMAs, and switch databases without leaving the keyboard":
    "Nouvelles commandes de console : run, pragma, db / use et close — exécuter du SQL, lire ou définir des PRAGMA, et changer de base sans quitter le clavier",
  "Single-key shortcuts: with nothing focused, tap one key to act (r = run, e / b / d = Editor / Browse / Diagram) — or just start typing and the active view's editor or filter picks it up automatically":
    "Raccourcis à une touche : sans champ actif, appuyez sur une touche pour agir (r = exécuter, e / b / d = Éditeur / Parcourir / Diagramme) — ou commencez simplement à taper et l'éditeur ou le filtre de la vue active le récupère automatiquement",
};
