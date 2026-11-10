"""Builds the three Import past trip templates (individual only, team only, team + individual) into public/templates.
The app reads only the yellow cells; the formulas are there to help people fill them in. Needs openpyxl.
Run: python3 scripts/build-past-trip-templates.py [out_dir]"""
import sys
from datetime import date
from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill, Border, Side
from openpyxl.formatting.rule import FormulaRule
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.utils import get_column_letter as L

OUT = sys.argv[1] if len(sys.argv) > 1 else "public/templates"
N_PLAYERS, N_ROUNDS, N_MATCHES, N_SCORES = 40, 20, 150, 400
P1 = 13                                   # first player row on the Trip sheet
P_LAST = P1 + N_PLAYERS - 1
R_LAST, M_LAST, S_LAST = N_ROUNDS + 1, N_MATCHES + 1, N_SCORES + 1

FONT = Font(name="Arial", size=10)
BOLD = Font(name="Arial", size=10, bold=True)
HEAD = Font(name="Arial", size=10, bold=True, color="FFFFFF")
TITLE = Font(name="Arial", size=16, bold=True, color="5B1A28")
SUB = Font(name="Arial", size=11, bold=True, color="5B1A28")
HEAD_FILL = PatternFill("solid", fgColor="5B1A28")
INPUT = PatternFill("solid", fgColor="FFF2CC")
CALC = PatternFill("solid", fgColor="EDEDED")
RED = PatternFill("solid", fgColor="F8D7DA")
THIN = Border(bottom=Side(style="thin", color="D9D9D9"))
WRAP = Alignment(wrap_text=True, vertical="top")

# Format, played with your own ball?, kind of round. Own-ball rounds count toward the individual.
TEAM_FORMATS = [("Fourball (best ball)", "Yes", "Team"), ("Singles", "Yes", "Team"), ("Alternate Shot", "No", "Team"),
                ("Chapman", "No", "Team"), ("Scramble", "No", "Team"), ("Shamble", "No", "Team")]
SOLO_FORMATS = [("Stroke Play", "Yes", "Individual"), ("Stableford", "Yes", "Individual"), ("Singles", "Yes", "Individual")]
METHODS = ["Lowest net total", "Lowest gross total", "Most Stableford points", "Most match points"]

# ---------------------------------------------------------------- example data (made up)
PLAYERS = [("Alex Brooks", 6, "Pines"), ("Riley Foster", 12, "Pines"), ("Jordan Hayes", 9, "Pines"), ("Casey Lopez", 15, "Pines"),
           ("Taylor Diaz", 8, "Palms"), ("Morgan Ellis", 10, "Palms"), ("Drew Keller", 4, "Palms"), ("Quinn Shaw", 14, "Palms")]
TEAM_ROUNDS = [(1, date(2025, 5, 15), "Pine Ridge GC", "Fourball (best ball)"), (2, date(2025, 5, 16), "Pine Ridge GC", "Alternate Shot"),
               (3, date(2025, 5, 17), "Oak Hollow GC", "Singles")]
TEAM_MATCHES = [(1, "Alex Brooks", "Riley Foster", "Taylor Diaz", "Morgan Ellis", "A"), (1, "Jordan Hayes", "Casey Lopez", "Drew Keller", "Quinn Shaw", "H"),
                (2, "Alex Brooks", "Jordan Hayes", "Drew Keller", "Taylor Diaz", "B"), (2, "Riley Foster", "Casey Lopez", "Morgan Ellis", "Quinn Shaw", "A"),
                (3, "Alex Brooks", None, "Taylor Diaz", None, "A"), (3, "Riley Foster", None, "Morgan Ellis", None, "B"),
                (3, "Jordan Hayes", None, "Drew Keller", None, "H"), (3, "Casey Lopez", None, "Quinn Shaw", None, "A")]
MIXED_SCORES = [(1, n, s) for n, s in zip([p[0] for p in PLAYERS], [80, 88, 84, 92, 83, 85, 79, 91])] + \
               [(4, n, s) for n, s in zip([p[0] for p in PLAYERS], [82, 87, 85, 90, 84, 87, 80, 93])]
SOLO_ROUNDS = [(1, date(2025, 5, 15), "Pine Ridge GC", "Stroke Play"), (2, date(2025, 5, 16), "Pine Ridge GC", "Stableford"),
               (3, date(2025, 5, 17), "Oak Hollow GC", "Singles")]
SOLO_SCORES = [(1, "Alex Brooks", 84), (1, "Riley Foster", 88), (1, "Jordan Hayes", 86), (1, "Casey Lopez", 95),
               (2, "Alex Brooks", 34), (2, "Riley Foster", 36), (2, "Jordan Hayes", 31), (2, "Casey Lopez", 33)]
SOLO_MATCHES = [(3, "Alex Brooks", "Riley Foster", "Alex Brooks"), (3, "Jordan Hayes", "Casey Lopez", "Halved")]


# ---------------------------------------------------------------- helpers
def sheet(wb, title, tab="5B1A28"):
    ws = wb.create_sheet(title)
    ws.sheet_properties.tabColor = tab
    return ws


def header(ws, row, names, widths, first_col=1):
    for i, (name, width) in enumerate(zip(names, widths), start=first_col):
        c = ws.cell(row=row, column=i, value=name)
        c.font, c.fill, c.alignment = HEAD, HEAD_FILL, Alignment(wrap_text=True, vertical="center")
        if width:
            ws.column_dimensions[L(i)].width = width
    ws.row_dimensions[row].height = 30


def paint(ws, cols, first, last, fill):
    for col in cols:
        for r in range(first, last + 1):
            c = ws[f"{col}{r}"]
            c.fill, c.font, c.border = fill, FONT, THIN


def problems_style(ws, col, first, last):
    ws.conditional_formatting.add(f"{col}{first}:{col}{last}", FormulaRule(formula=[f"LEN({col}{first})>0"], fill=RED, font=Font(name="Arial", size=10, color="9C0006")))


def round_dividers(ws, last_col, last_row):
    """A dark line above the first row of each new round, so rounds read as blocks."""
    line = Border(top=Side(style="thin", color="5B1A28"))
    ws.conditional_formatting.add(f"A3:{last_col}{last_row}", FormulaRule(formula=['AND($A3<>"",$A3<>$A2)'], border=line))


def hole_scores(total, seed):
    """18 made-up hole scores that add up to `total`."""
    holes = [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 3, 4, 5, 4, 4, 3, 4, 5]
    extra = total - sum(holes)
    for i in range(extra):
        holes[(i * 7 + seed) % 18] += 1
    return holes


def dropdown(ws, rng, source, prompt=None):
    dv = DataValidation(type="list", formula1=source, allow_blank=True, showErrorMessage=True,
                        errorTitle="Pick from the list", error="Choose one of the options in the dropdown.")
    if prompt:
        dv.promptTitle, dv.prompt, dv.showInputMessage = "Tip", prompt, True
    ws.add_data_validation(dv)
    dv.add(rng)


def number_rule(ws, rng, lo, hi, msg):
    dv = DataValidation(type="decimal", operator="between", formula1=str(lo), formula2=str(hi), allow_blank=True,
                        showErrorMessage=True, errorTitle="Check the number", error=msg)
    ws.add_data_validation(dv)
    dv.add(rng)


def date_rule(ws, rng):
    dv = DataValidation(type="date", operator="between", formula1="DATE(1950,1,1)", formula2="DATE(2100,12,31)", allow_blank=True,
                        showErrorMessage=True, errorTitle="Use a date", error="Type a date like 5/15/2025.")
    ws.add_data_validation(dv)
    dv.add(rng)
    for row in ws[rng]:
        for c in row:
            c.number_format = "mmm d, yyyy"


NAMES = f"Trip!$A${P1}:$A${P_LAST}"
HCPS = f"Trip!$B${P1}:$B${P_LAST}"
TEAMS = f"Trip!$C${P1}:$C${P_LAST}"
RNUM = f"Rounds!$A$2:$A${R_LAST}"
RFMT = f"Rounds!$D$2:$D${R_LAST}"


def rng(sheet_name, col, last):
    return f"{sheet_name}!${col}$2:${col}${last}"


# ---------------------------------------------------------------- sheets
def build(kind):
    team, solo = kind in ("team", "mixed"), kind in ("solo", "mixed")
    formats = TEAM_FORMATS if kind == "team" else SOLO_FORMATS if kind == "solo" else TEAM_FORMATS + SOLO_FORMATS[:2]
    F_LAST = len(formats) + 1
    FMT_NAMES, FMT_OWN, FMT_KIND = f"Lists!$A$2:$A${F_LAST}", f"Lists!$B$2:$B${F_LAST}", f"Lists!$C$2:$C${F_LAST}"

    def round_format(cell):
        return f'IFERROR(INDEX({RFMT},MATCH({cell},{RNUM},0)),"")'

    def format_info(fmt, col):
        return f'IFERROR(INDEX({col},MATCH({fmt},{FMT_NAMES},0)),"")'

    wb = Workbook()
    start = wb.active
    start.title = "Start Here"

    # ---- Trip: details on top, players underneath
    trip = sheet(wb, "Trip")
    for col, w in zip("ABCD", [28, 26, 16 if team else 50, 50]):
        trip.column_dimensions[col].width = w
    trip["A1"], trip["A1"].font = "Trip", TITLE
    details = [("Trip name", "Spring Golf Trip"), ("Start date", date(2025, 5, 15)), ("End date", date(2025, 5, 18 if kind == "mixed" else 17)), ("Where", "Pine Ridge, NC")]
    if team:
        details += [("Team 1 name", "Pines"), ("Team 2 name", "Palms")]
    if solo:
        details += [("Individual winner decided by", "Lowest net total")]
    cell = {}
    for r, (label, value) in enumerate(details, start=3):
        trip[f"A{r}"], trip[f"A{r}"].font = label, BOLD
        c = trip[f"B{r}"]
        c.value, c.fill, c.font, c.border = value, INPUT, FONT, THIN
        cell[label] = f"Trip!$B${r}"
    date_rule(trip, "B4:B5")
    TEAM_A, TEAM_B = cell.get("Team 1 name"), cell.get("Team 2 name")
    METHOD = cell.get("Individual winner decided by")

    trip[f"A{P1 - 2}"], trip[f"A{P1 - 2}"].font = "Players", SUB
    pnames = ["Player name", "Handicap"] + (["Team"] if team else []) + ["Problems (blank = OK)"]
    header(trip, P1 - 1, pnames, [None] * len(pnames))
    PP = L(len(pnames))
    for r, p in enumerate(PLAYERS if team else PLAYERS[:4], start=P1):
        trip[f"A{r}"], trip[f"B{r}"] = p[0], p[1]
        if team:
            trip[f"C{r}"] = p[2]
    paint(trip, [L(i) for i in range(1, len(pnames))], P1, P_LAST, INPUT)
    paint(trip, [PP], P1, P_LAST, CALC)
    number_rule(trip, f"B{P1}:B{P_LAST}", -10, 54, "Handicaps go from -10 (plus) to 54.")
    for r in range(P1, P_LAST + 1):
        checks = [f'IF(COUNTIF({NAMES},$A{r})>1,"This name is listed twice. ","")']
        if team:
            checks.append(f'IF($C{r}="","Pick their team. ","")')
        trip[f"{PP}{r}"] = f'=IF($A{r}="","",' + "&".join(checks) + ")"
    problems_style(trip, PP, P1, P_LAST)
    trip.freeze_panes = f"A{P1}"

    # ---- Lists (hidden): dropdown options
    lists = sheet(wb, "Lists", "999999")
    for i, (f, own, k) in enumerate(formats, start=2):
        lists[f"A{i}"], lists[f"B{i}"], lists[f"C{i}"] = f, own, k
    for i, m in enumerate(METHODS, start=2):
        lists[f"D{i}"] = m
    if team:
        lists["E2"], lists["E3"], lists["E4"] = f"={TEAM_A}", f"={TEAM_B}", "Halved"
    # Solo match winner: Halved, then every player.
    lists["F2"] = "Halved"
    for i in range(N_PLAYERS):
        lists[f"F{i + 3}"] = f'=IF(Trip!$A${P1 + i}="","",Trip!$A${P1 + i})'
    lists.sheet_state = "hidden"
    if team:
        dropdown(trip, f"C{P1}:C{P_LAST}", "Lists!$E$2:$E$3", "Pick the team they played for.")
    if solo:
        dropdown(trip, METHOD.replace("Trip!", "").replace("$", ""), f"Lists!$D$2:$D${len(METHODS) + 1}")

    # ---- Rounds (files with individual scores also ask for the course par, so totals can show as +6 or E)
    rd = sheet(wb, "Rounds")
    rnames = ["Round", "Date", "Course", "Format"] + (["Par"] if solo else []) + (["Counts for individual?"] if kind == "mixed" else []) + ["Problems (blank = OK)"]
    header(rd, 1, rnames, [8, 14, 28, 18] + ([7] if solo else []) + ([13] if kind == "mixed" else []) + [44])
    rd.freeze_panes = "A2"
    rounds = SOLO_ROUNDS if kind == "solo" else TEAM_ROUNDS + ([(4, date(2025, 5, 18), "Oak Hollow GC", "Stroke Play")] if kind == "mixed" else [])
    for r, (n, d, course, fmt) in enumerate(rounds, start=2):
        rd[f"A{r}"], rd[f"B{r}"], rd[f"C{r}"], rd[f"D{r}"] = n, d, course, fmt
        if solo:
            rd[f"E{r}"] = 72
    paint(rd, list("ABCD") + (["E"] if solo else []), 2, R_LAST, INPUT)
    RP = L(len(rnames))
    paint(rd, (["F"] if kind == "mixed" else []) + [RP], 2, R_LAST, CALC)
    date_rule(rd, f"B2:B{R_LAST}")
    number_rule(rd, f"A2:A{R_LAST}", 1, 50, "Round numbers are 1, 2, 3...")
    dropdown(rd, f"D2:D{R_LAST}", FMT_NAMES)
    if solo:
        number_rule(rd, f"E2:E{R_LAST}", 27, 80, "Type the course par, like 72 (or 36 for 9 holes).")
    for r in range(2, R_LAST + 1):
        if kind == "mixed":
            rd[f"F{r}"] = f'=IF($D{r}="","",{format_info(f"$D{r}", FMT_OWN)})'
        par_check = f'&IF(AND($E{r}="",{format_info(f"$D{r}", FMT_OWN)}="Yes"),"Add the course par. ","")' if solo else ""
        rd[f"{RP}{r}"] = (f'=IF($A{r}="","",IF(COUNTIF({RNUM},$A{r})>1,"Round "&$A{r}&" is listed twice. ","")'
                          f'&IF(AND(ISNUMBER($B{r}),OR($B{r}<Trip!$B$4,$B{r}>Trip!$B$5)),"The date isn\'t during the trip. ","")'
                          f'&IF($C{r}="","Add the course. ","")&IF($D{r}="","Pick a format. ","")' + par_check + ')')
    problems_style(rd, RP, 2, R_LAST)

    # ---- Matches
    ma = sheet(wb, "Matches")
    ma.freeze_panes = "A2"
    MA = lambda col: rng("Matches", col, M_LAST)
    if team:
        mnames = ["Round", f'={TEAM_A}&" player 1"', f'={TEAM_A}&" player 2"', f'={TEAM_B}&" player 1"', f'={TEAM_B}&" player 2"', "Winner"] + \
                 (["Counts for individual?"] if kind == "mixed" else []) + ["Problems (blank = OK)"]
        header(ma, 1, mnames, [8, 20, 20, 20, 20, 14] + ([13] if kind == "mixed" else []) + [60])
        for r, (rn, a1, a2, b1, b2, res) in enumerate(TEAM_MATCHES, start=2):
            ma[f"A{r}"], ma[f"B{r}"], ma[f"C{r}"], ma[f"D{r}"], ma[f"E{r}"] = rn, a1, a2, b1, b2
            ma[f"F{r}"] = "Pines" if res == "A" else "Palms" if res == "B" else "Halved"
        paint(ma, list("ABCDEF"), 2, M_LAST, INPUT)
        MP = L(len(mnames))
        paint(ma, (["G"] if kind == "mixed" else []) + [MP], 2, M_LAST, CALC)
        for col in "BCDE":
            dropdown(ma, f"{col}2:{col}{M_LAST}", NAMES)
        dropdown(ma, f"F2:F{M_LAST}", "Lists!$E$2:$E$4")
        dropdown(ma, f"A2:A{M_LAST}", RNUM)
        for r in range(2, M_LAST + 1):
            fmt = round_format(f"$A{r}")
            if kind == "mixed":
                ma[f"G{r}"] = f'=IF($A{r}="","",IF({format_info(fmt, FMT_OWN)}="","",{format_info(fmt, FMT_OWN)}))'
            checks = [f'IF(ISNA(MATCH($A{r},{RNUM},0)),"Round "&$A{r}&" isn\'t on the Rounds sheet. ","")',
                      f'IF({format_info(fmt, FMT_KIND)}="Individual","Round "&$A{r}&" is "&{fmt}&", not a team match. ","")',
                      f'IF(OR($B{r}="",$D{r}=""),"Each side needs a player. ","")',
                      f'IF(AND({fmt}="Singles",OR($C{r}<>"",$E{r}<>"")),"Singles is one player a side. ","")',
                      f'IF(AND({format_info(fmt, FMT_KIND)}="Team",{fmt}<>"Singles",OR($C{r}="",$E{r}="")),{fmt}&" needs two players a side. ","")',
                      f'IF($F{r}="","Pick the winner. ",IF(AND($F{r}<>{TEAM_A},$F{r}<>{TEAM_B},$F{r}<>"Halved"),"Pick the winner again (team names changed). ",""))']
            for col, side in zip("BCDE", [TEAM_A, TEAM_A, TEAM_B, TEAM_B]):
                c = f"${col}{r}"
                checks.append(f'IF({c}="","",IF(COUNTIF({NAMES},{c})=0,{c}&" isn\'t on the Trip sheet. ",IF(COUNTIFS({NAMES},{c},{TEAMS},{side})=0,{c}&" isn\'t on "&{side}&". ","")))')
                n = "+".join(f"COUNTIFS({MA('A')},$A{r},{MA(k)},{c})" for k in "BCDE")
                checks.append(f'IF(AND({c}<>"",{n}>1),{c}&" is in two matches in round "&$A{r}&". ","")')
            ma[f"{MP}{r}"] = f'=IF($A{r}="","",' + "&".join(checks) + ")"
        problems_style(ma, MP, 2, M_LAST)
        round_dividers(ma, MP, M_LAST)
    else:
        mnames = ["Round", "Player 1", "Player 2", "Winner", "Problems (blank = OK)"]
        header(ma, 1, mnames, [8, 22, 22, 22, 60])
        for r, (rn, p1, p2, w) in enumerate(SOLO_MATCHES, start=2):
            ma[f"A{r}"], ma[f"B{r}"], ma[f"C{r}"], ma[f"D{r}"] = rn, p1, p2, w
        paint(ma, list("ABCD"), 2, M_LAST, INPUT)
        MP = "E"
        paint(ma, [MP], 2, M_LAST, CALC)
        for col in "BC":
            dropdown(ma, f"{col}2:{col}{M_LAST}", NAMES)
        dropdown(ma, f"D2:D{M_LAST}", f"Lists!$F$2:$F${N_PLAYERS + 2}", "Pick the winner's name, or Halved.")
        dropdown(ma, f"A2:A{M_LAST}", RNUM)
        for r in range(2, M_LAST + 1):
            checks = [f'IF(ISNA(MATCH($A{r},{RNUM},0)),"Round "&$A{r}&" isn\'t on the Rounds sheet. ","")',
                      f'IF(AND(NOT(ISNA(MATCH($A{r},{RNUM},0))),{round_format(f"$A{r}")}<>"Singles"),"Round "&$A{r}&" isn\'t Singles match play. ","")',
                      f'IF(OR($B{r}="",$C{r}=""),"Add both players. ","")',
                      f'IF(AND($B{r}<>"",$B{r}=$C{r}),"A player can\'t play themselves. ","")',
                      f'IF($D{r}="","Pick the winner. ",IF(AND($D{r}<>$B{r},$D{r}<>$C{r},$D{r}<>"Halved"),"The winner must be one of the two players, or Halved. ",""))']
            for col in "BC":
                c = f"${col}{r}"
                checks.append(f'IF(AND({c}<>"",COUNTIF({NAMES},{c})=0),{c}&" isn\'t on the Trip sheet. ","")')
                n = f"COUNTIFS({MA('A')},$A{r},{MA('B')},{c})+COUNTIFS({MA('A')},$A{r},{MA('C')},{c})"
                checks.append(f'IF(AND({c}<>"",{n}>1),{c}&" is in two matches in round "&$A{r}&". ","")')
            ma[f"{MP}{r}"] = f'=IF($A{r}="","",' + "&".join(checks) + ")"
        problems_style(ma, MP, 2, M_LAST)
        round_dividers(ma, MP, M_LAST)

    # ---- Scores (not in the team-only file): a total, or hole by hole, or both
    SP = None
    if solo:
        sc = sheet(wb, "Scores")
        sc.freeze_panes = "D2"
        holes = [L(4 + h) for h in range(18)]  # D..U
        H = lambda r: f"${holes[0]}{r}:${holes[-1]}{r}"
        snames = ["Round", "Player", "Total score"] + [str(h) for h in range(1, 19)] + ["Score", "Format", "Net", "Problems (blank = OK)"]
        header(sc, 1, snames, [8, 22, 10] + [4.5] * 18 + [8, 16, 8, 60])
        sample = SOLO_SCORES if kind == "solo" else MIXED_SCORES
        by_hole = (1, "Alex Brooks") if kind == "solo" else (4, "Alex Brooks")  # one example row typed hole by hole
        for r, (rn, name, s) in enumerate(sample, start=2):
            sc[f"A{r}"], sc[f"B{r}"] = rn, name
            if (rn, name) == by_hole:
                for col, v in zip(holes, hole_scores(s, r)):
                    sc[f"{col}{r}"] = v
            else:
                sc[f"C{r}"] = s
        paint(sc, ["A", "B", "C"] + holes, 2, S_LAST, INPUT)
        SC, SF, SN, SP = "V", "W", "X", "Y"
        paint(sc, [SC, SF, SN, SP], 2, S_LAST, CALC)
        dropdown(sc, f"B2:B{S_LAST}", NAMES)
        dropdown(sc, f"A2:A{S_LAST}", RNUM)
        number_rule(sc, f"C2:C{S_LAST}", 0, 200, "Type the total for the round, like 84 (or points for Stableford, like 34).")
        number_rule(sc, f"D2:U{S_LAST}", 1, 15, "A hole score is from 1 to 15.")
        for r in range(2, S_LAST + 1):
            hr = H(r)
            sc[f"{SF}{r}"] = f'=IF($A{r}="","",{round_format(f"$A{r}")})'
            # Score = the total if typed, otherwise the holes added up (Stableford needs the points typed as the total).
            sc[f"{SC}{r}"] = f'=IF($C{r}<>"",$C{r},IF(AND(${SF}{r}<>"Stableford",COUNT({hr})>0),SUM({hr}),""))'
            hcp = f'IFERROR(INDEX({HCPS},MATCH($B{r},{NAMES},0)),0)'
            counts = f'{format_info(f"${SF}{r}", FMT_OWN)}="Yes"'
            sc[f"{SN}{r}"] = f'=IF(OR(${SC}{r}="",${SF}{r}="Stableford",NOT({counts})),"",${SC}{r}-{hcp})'
            checks = [f'IF($A{r}="","Add the round number. ","")', f'IF($B{r}="","Add the player. ","")',
                      f'IF(AND($C{r}="",COUNT({hr})=0),"Add the score. ","")',
                      f'IF(AND(${SF}{r}="Stableford",$C{r}=""),"Type the Stableford points in Total score. ","")',
                      f'IF(AND(COUNT({hr})>0,COUNT({hr})<>9,COUNT({hr})<>18),"Only "&COUNT({hr})&" holes filled in. ","")',
                      f'IF(AND($C{r}<>"",COUNT({hr})>0,${SF}{r}<>"Stableford",$C{r}<>SUM({hr})),"Total "&$C{r}&" doesn\'t match the holes ("&SUM({hr})&"). ","")',
                      f'IF(AND($A{r}<>"",ISNA(MATCH($A{r},{RNUM},0))),"Round "&$A{r}&" isn\'t on the Rounds sheet. ","")',
                      f'IF(AND(${SF}{r}<>"",NOT({counts})),"Round "&$A{r}&" was "&${SF}{r}&", so there are no individual scores. ","")',
                      f'IF(AND($B{r}<>"",COUNTIF({NAMES},$B{r})=0),$B{r}&" isn\'t on the Trip sheet. ","")',
                      f'IF(AND($A{r}<>"",$B{r}<>"",COUNTIFS({rng("Scores", "A", S_LAST)},$A{r},{rng("Scores", "B", S_LAST)},$B{r})>1),$B{r}&" has two rows for round "&$A{r}&". ","")']
            sc[f"{SP}{r}"] = f'=IF(AND($A{r}="",$B{r}="",$C{r}="",COUNT({hr})=0),"",' + "&".join(checks) + ")"
        problems_style(sc, SP, 2, S_LAST)
        round_dividers(sc, SP, S_LAST)

    # ---- Results
    st = sheet(wb, "Results", "1F6F43")
    st.freeze_panes = "A2"
    off = 0
    if team:
        header(st, 1, ["Round", f"={TEAM_A}", f"={TEAM_B}"], [10, 14, 14])
        for r in range(2, R_LAST + 1):
            rn = f"INDEX({RNUM},{r - 1})"
            st[f"A{r}"] = f'=IF({rn}="","",{rn})'
            is_team = f'{format_info(round_format(f"$A{r}"), FMT_KIND)}="Team"'
            for col, side in (("B", TEAM_A), ("C", TEAM_B)):
                st[f"{col}{r}"] = f'=IF(OR($A{r}="",NOT({is_team})),"",COUNTIFS({MA("A")},$A{r},{MA("F")},{side})+0.5*COUNTIFS({MA("A")},$A{r},{MA("F")},"Halved"))'
        tot, win = R_LAST + 2, R_LAST + 3
        st[f"A{tot}"], st[f"A{win}"] = "Total", "Winner"
        st[f"B{tot}"], st[f"C{tot}"] = f"=SUM(B2:B{R_LAST})", f"=SUM(C2:C{R_LAST})"
        st[f"B{win}"] = f'=IF(B{tot}+C{tot}=0,"",IF(B{tot}>C{tot},{TEAM_A},IF(C{tot}>B{tot},{TEAM_B},"Tied")))'
        for c in (f"A{tot}", f"A{win}", f"B{tot}", f"C{tot}", f"B{win}"):
            st[c].font = BOLD
        off = 4
        st.column_dimensions["D"].width = 3

    # Player table: match record for everyone; scores and a place too when there's an individual winner.
    c = lambda i: L(off + i)
    cols = ["Player"] + (["Team"] if kind == "team" else []) + (["Rounds", "Gross total", "Net total", "Stableford points"] if solo else []) + \
           ["Match wins", "Losses", "Halved", "Match points"] + (["Place"] if solo else [])
    widths = {"Player": 22, "Team": 14, "Stableford points": 11}
    header(st, 1, cols, [widths.get(n, 9) for n in cols], first_col=off + 1)
    col = {n: c(i) for i, n in enumerate(cols, start=1)}
    S = lambda k: rng("Scores", k, S_LAST)
    for r in range(2, P_LAST - P1 + 3):
        name = f"INDEX({NAMES},{r - 1})"
        P = f"${col['Player']}{r}"
        st[f"{col['Player']}{r}"] = f'=IF({name}="","",{name})'
        if kind == "team":
            st[f"{col['Team']}{r}"] = f'=IF({P}="","",INDEX({TEAMS},{r - 1}))'
        if solo:
            counted = f'{S(SN)},">-100"'  # Net is a number only for stroke scores that count
            strokes = f'COUNTIFS({S("B")},{P},{counted})'
            stab = f'COUNTIFS({S("B")},{P},{S(SF)},"Stableford",{S(SC)},">=0")'
            st[f"{col['Rounds']}{r}"] = f'=IF({P}="","",{strokes}+{stab})'
            st[f"{col['Gross total']}{r}"] = f'=IF({P}="","",IF({strokes}=0,"",SUMIFS({S(SC)},{S("B")},{P},{counted})))'
            st[f"{col['Net total']}{r}"] = f'=IF({P}="","",IF({strokes}=0,"",SUMIFS({S(SN)},{S("B")},{P})))'
            st[f"{col['Stableford points']}{r}"] = f'=IF({P}="","",IF({stab}=0,"",SUMIFS({S(SC)},{S("B")},{P},{S(SF)},"Stableford")))'
        if team:
            own = f',{MA("G")},"Yes"' if kind == "mixed" else ""  # mixed file: only own-ball matches count for the individual
            res = lambda a, b: "+".join([f'COUNTIFS({MA(k)},{P},{MA("F")},{a}{own})' for k in "BC"] + [f'COUNTIFS({MA(k)},{P},{MA("F")},{b}{own})' for k in "DE"])
            won, lost, halved = res(TEAM_A, TEAM_B), res(TEAM_B, TEAM_A), res('"Halved"', '"Halved"')
        else:
            two = lambda crit: f'COUNTIFS({MA("B")},{P},{MA("D")},{crit})+COUNTIFS({MA("C")},{P},{MA("D")},{crit})'
            won, halved = two(P), two('"Halved"')
            lost = f'SUMPRODUCT(({MA("B")}={P})*({MA("D")}={MA("C")}))+SUMPRODUCT(({MA("C")}={P})*({MA("D")}={MA("B")}))'
        st[f"{col['Match wins']}{r}"] = f'=IF({P}="","",{won})'
        st[f"{col['Losses']}{r}"] = f'=IF({P}="","",{lost})'
        st[f"{col['Halved']}{r}"] = f'=IF({P}="","",{halved})'
        st[f"{col['Match points']}{r}"] = f'=IF({P}="","",{col["Match wins"]}{r}+0.5*{col["Halved"]}{r})'
        if solo:
            whole = lambda n: f"{col[n]}$2:{col[n]}${P_LAST - P1 + 2}"
            rank = (f'IF({METHOD}="Lowest gross total",RANK({col["Gross total"]}{r},{whole("Gross total")},1),'
                    f'IF({METHOD}="Most Stableford points",RANK({col["Stableford points"]}{r},{whole("Stableford points")},0),'
                    f'IF({METHOD}="Most match points",RANK({col["Match points"]}{r},{whole("Match points")},0),'
                    f'RANK({col["Net total"]}{r},{whole("Net total")},1))))')
            st[f"{col['Place']}{r}"] = f'=IF({P}="","",IFERROR({rank},""))'
    if solo:
        wl = L(off + len(cols) + 2)
        st.column_dimensions[wl].width = 26
        st[f"{wl}1"], st[f"{wl}1"].font = ("Individual champion" if team else "Champion"), BOLD
        place = f"{col['Place']}$2:{col['Place']}${P_LAST - P1 + 2}"
        st[f"{wl}2"] = f'=IFERROR(INDEX({col["Player"]}$2:{col["Player"]}${P_LAST - P1 + 2},MATCH(1,{place},0)),"")'
        st[f"{wl}2"].font = SUB
        st[f"{wl}3"] = f'="Decided by: "&{METHOD}'
    for row in st.iter_rows(min_row=2, max_row=max(P_LAST - P1 + 2, R_LAST + 3)):
        for cl in row:
            if cl.value is not None and cl.font != BOLD and cl.font != SUB:
                cl.font = FONT

    # ---- Start Here
    start.sheet_properties.tabColor = "1F6F43"
    start.column_dimensions["A"].width, start.column_dimensions["B"].width = 4, 100
    kind_name = {"solo": "Individual trip", "team": "Team trip", "mixed": "Team + individual trip"}[kind]
    lines = [("title", f"Past trip: {kind_name}"),
             ("text", "One file per year. The filled-in rows are a made-up example: type over them."),
             ("gap", ""),
             ("step", "1. Trip: the trip details and everyone who played" + (", with their team." if team else ".")),
             ("step", "2. Rounds: one row per round, with the course and format" + (", and the course par for rounds with scores." if solo else ".")),
             ("step", "3. Matches: " + ("who played who in each round, and who won." if team else "only for Singles (match play) rounds: who played who, and who won.")),
             ]
    if solo:
        lines.append(("step", "4. Scores: each player's score for each round. Type the total, or fill in holes 1-18 and it adds them up. For Stableford, type the points as the total."))
    lines.append(("text", "Keep each round's rows together. A dark line marks where the next round starts."))
    lines.append(("step", f"{5 if solo else 4}. Results: check it matches what you remember."))
    if kind == "mixed":
        lines += [("gap", ""), ("head", "What counts for the individual"),
                  ("text", "Rounds where everyone plays their own ball count for the individual too: Fourball (best ball), Singles, Stroke Play and Stableford. "
                           "Their matches go on each player's record and their scores count."),
                  ("text", "Rounds with a shared ball count for the team only: Alternate Shot, Chapman, Scramble and Shamble.")]
    lines += [("gap", ""), ("legend", "Yellow: type here (most cells have a dropdown)."), ("legend", "Grey: filled in for you."),
              ("legend", "Red: something to fix. It says what's wrong."), ("gap", ""), ("head", "Ready to upload?")]
    r = 1
    for kind_, text in lines:
        cl = start[f"B{r}"]
        cl.value = text or None
        cl.alignment = WRAP
        cl.font = TITLE if kind_ == "title" else SUB if kind_ == "head" else FONT
        if kind_ == "legend":
            start[f"A{r}"].fill = INPUT if text.startswith("Yellow") else CALC if text.startswith("Grey") else RED
        r += 2 if kind_ == "title" else 1
    probs = {"Trip": f"SUMPRODUCT(LEN(Trip!${PP}${P1}:${PP}${P_LAST}))", "Rounds": f"SUMPRODUCT(LEN(Rounds!${RP}$2:${RP}${R_LAST}))",
             "Matches": f"SUMPRODUCT(LEN(Matches!${MP}$2:${MP}${M_LAST}))"}
    if SP:
        probs["Scores"] = f"SUMPRODUCT(LEN(Scores!${SP}$2:${SP}${S_LAST}))"
    where = "&".join(f'IF({p}>0,"{n} ","")' for n, p in probs.items())
    start[f"B{r}"] = f'=IF({"+".join(probs.values())}=0,"Yes. No problems found.","Not yet. Fix the red cells on: "&TRIM({where}))'
    start[f"B{r}"].font = Font(name="Arial", size=12, bold=True, color="1F6F43")
    wb.move_sheet("Lists", offset=10)
    wb.active = 0
    for ws in wb.worksheets:
        ws.sheet_view.showGridLines = ws.title not in ("Start Here", "Trip")
    name = {"solo": "past-trip-individual.xlsx", "team": "past-trip-team.xlsx", "mixed": "past-trip-team-and-individual.xlsx"}[kind]
    wb.save(f"{OUT}/{name}")
    return name


for k in ("solo", "team", "mixed"):
    print(build(k))
