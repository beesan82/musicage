import { deleteTemporaryRecording } from '../deleteTemporaryRecording';

describe('deleteTemporaryRecording', () => {
  it('does nothing for a null URI', () => {
    const factory = jest.fn();

    deleteTemporaryRecording(null, factory);

    expect(factory).not.toHaveBeenCalled();
  });

  it('deletes an existing temporary file once', () => {
    const remove = jest.fn();
    const factory = jest.fn(() => ({ exists: true, delete: remove }));

    deleteTemporaryRecording('file:///cache/meter.m4a', factory);

    expect(factory).toHaveBeenCalledWith('file:///cache/meter.m4a');
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it('does not throw when the stopped recorder file is already absent', () => {
    expect(() =>
      deleteTemporaryRecording('file:///cache/missing.m4a', () => ({
        exists: false,
        delete: jest.fn(),
      })),
    ).not.toThrow();
  });
});
