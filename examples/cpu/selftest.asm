; 8-bit CPU self-test. Pair with selftest.test (@mode queue).
; 127 bytes: IMM carries 7 bits, so nothing above 127 can be a jump target.

#define A 0
#define B 1
#define C 2
#define D 3
#define E 4
#define PTR 5
#define MEM 6
#define IO 7

; 0b0xx IMM
; 0b10x MOV
; 0b110 ALU
; 0b111 COND

; IMM
#define IMM(v) v & 0b0111_1111

; MOV
#define ARG1(reg) reg      & 0b00_000_111
#define ARG2(reg) reg << 3 & 0b00_111_000
#define MOV(dst, src) 0b10_000_000 | ARG2(dst) | ARG1(src)

; ALU
; use REG0, REG1 as inputs, output to REG2
#define ANOP 0b110_00_000
#define NOT  0b110_00_001
#define AND  0b110_00_010
#define OR   0b110_00_011
#define ADD  0b110_00_100
#define SUB  0b110_00_101
#define SHR  0b110_00_110
#define SHL  0b110_00_111

; COND
; use REG2 as input. if COND is true - set REG0 value to counter
; REG2 is also where the ALU writes, so a result can be branched on without moving it first
#define JNEVER 0b111_00_000
#define JMP    0b111_00_001
#define JZ     0b111_00_010
#define JNZ    0b111_00_011
#define JL     0b111_00_100
#define JGE    0b111_00_101
#define JLE    0b111_00_110
#define JG     0b111_00_111

; both no-ops were named NOP; the second #define would have replaced the first
#define SET(reg, v)           IMM(v), MOV(reg, A)
#define IN(reg)               MOV(reg, IO)
#define OUT(reg)              MOV(IO, reg)
#define GOTO(target)          IMM(target), JMP
#define GOTO_IF(cond, target) IMM(target), cond

; 1. boot
  IMM(85)
  MOV(E, A)
  OUT(E)

; 2. ALU: operands in, result out, flag 1 to repeat or 0 for the next opcode
; the label has to start the line - one arriving mid-expansion is a syntax error
; the flag is read into C, over the result that was just published from it
#define BINARY_TEST(name, op) name: IN(A) IN(B) op OUT(C) IN(C) GOTO_IF(JNZ, name)
#define UNARY_TEST(name, op)  name: IN(A)       op OUT(C) IN(C) GOTO_IF(JNZ, name)

  UNARY_TEST (t_not, NOT)
  BINARY_TEST(t_and, AND)
  BINARY_TEST(t_or,  OR)
  BINARY_TEST(t_add, ADD)
  BINARY_TEST(t_sub, SUB)
  BINARY_TEST(t_shr, SHR)
  BINARY_TEST(t_shl, SHL)

; 3. all 8 conditions through a jump table - the test writes the selector
c_loop:
  SET(B, 2)             ; entries are 4 bytes wide
  IN(A)                 ; selector 0..7
  SHL
  SET(B, c_table)       ; clobbers A, leaves C
  MOV(A, C)
  ADD
  MOV(A, C)             ; the entry to jump to
  IN(C)                 ; the value the condition looks at - read last, nothing clobbers C after
  JMP

#define COND_ENTRY(cond) GOTO_IF(cond, c_yes) GOTO(c_no)

c_table:
  COND_ENTRY(JNEVER)
  COND_ENTRY(JMP)
  COND_ENTRY(JZ)
  COND_ENTRY(JNZ)
  COND_ENTRY(JL)
  COND_ENTRY(JGE)
  COND_ENTRY(JLE)
  COND_ENTRY(JG)

c_no:
  IMM(0)
  OUT(A)
  GOTO(c_tail)
c_yes:
  IMM(1)
  OUT(A)
c_tail:
  IN(C)
  GOTO_IF(JNZ, c_loop)

; 4. store bytes at RAM[0..] until a 0, then publish the count
  SET(PTR, 0)
walk_loop:
  IN(C)                 ; the byte, tested for the 0 that ends the list
  GOTO_IF(JZ, walk_done)
  MOV(MEM, C)
  SET(B, 1)
  MOV(A, PTR)
  ADD
  MOV(PTR, C)
  GOTO(walk_loop)
walk_done:
  OUT(PTR)

; 5. store at one address, read back another
mem_loop:
  IN(PTR)
  IN(D)                 ; the byte goes through D, the one register nothing else here uses
  MOV(MEM, D)
  IN(PTR)
  OUT(MEM)
  IN(C)
  GOTO_IF(JNZ, mem_loop)

halt:
  GOTO(halt)
