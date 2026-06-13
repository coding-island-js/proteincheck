import { Test } from '@nestjs/testing';
import { AnalyzeService } from './analyze.service';
import { GeminiService } from './gemini.service';
import { PrismaService } from '../prisma.service';
import { ScanResult } from './dto';

const mockResult: ScanResult = {
  totalProtein: 42,
  items: [
    { name: 'Grilled chicken', protein: 35 },
    { name: 'Rice', protein: 7 },
  ],
  verdict: 'Solid protein hit',
  summary: 'A high-protein plate.',
  confidence: 'high',
};

describe('AnalyzeService', () => {
  let service: AnalyzeService;
  const gemini = { analyze: jest.fn().mockResolvedValue(mockResult) };
  const prisma = { enabled: false, scan: { create: jest.fn() } };

  beforeEach(async () => {
    jest.clearAllMocks();
    const mod = await Test.createTestingModule({
      providers: [
        AnalyzeService,
        { provide: GeminiService, useValue: gemini },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = mod.get(AnalyzeService);
  });

  it('strips the data URL prefix and returns the protein estimate', async () => {
    const out = await service.analyze({ image: 'data:image/png;base64,AAAA' });
    expect(out).toEqual(mockResult);
    expect(gemini.analyze).toHaveBeenCalledWith('AAAA', 'image/png');
  });

  it('skips persistence when the database is disabled', async () => {
    await service.analyze({ image: 'rawbase64' });
    expect(gemini.analyze).toHaveBeenCalledWith('rawbase64', 'image/jpeg');
    expect(prisma.scan.create).not.toHaveBeenCalled();
  });
});
